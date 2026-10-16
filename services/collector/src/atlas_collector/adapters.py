"""Verified upstream schemas; adapters never substitute another instrument."""
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo
import json
import os
import subprocess
import sys
from .errors import CollectorError
from .http import JsonClient
from .models import Bar, Observation, Quote

SHANGHAI = ZoneInfo('Asia/Shanghai')

def number(value, *, positive=False):
    try:
        result = Decimal(str(value))
        if not result.is_finite() or (positive and result <= 0):
            raise ValueError
        return result
    except (InvalidOperation, ValueError, TypeError):
        raise CollectorError('invalid_value', 'Provider returned a missing or invalid numeric value.') from None

def day(value):
    try:
        return value if type(value) is date else date.fromisoformat(str(value))
    except (ValueError, TypeError):
        raise CollectorError('invalid_date', 'Provider returned an invalid statistical date.') from None

def stamp(value):
    try:
        result = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        if result.tzinfo is None:
            raise ValueError
        return result
    except (ValueError, TypeError):
        raise CollectorError('invalid_timestamp', 'Provider did not supply a valid timestamp with timezone.') from None

def normalize_fred(payload):
    if not isinstance(payload, dict) or not isinstance(payload.get('observations'), list):
        raise CollectorError('invalid_response', 'FRED observations are missing.')
    return [Observation(day(row['date']), None if row.get('value') in ('.', None) else number(row['value']), quality_flags=['missing_source_value'] if row.get('value') in ('.', None) else []) for row in payload['observations']]

def normalize_frankfurter(payload, symbol):
    base, quote = symbol.upper().split('/')
    if not isinstance(payload, list):
        raise CollectorError('invalid_response', 'Frankfurter rates are missing.')
    result = []
    for row in payload:
        if row.get('base') != base or row.get('quote') != quote:
            raise CollectorError('instrument_mismatch', 'Provider returned a different currency pair.')
        result.append(Observation(day(row['date']), number(row['rate'], positive=True), quality_flags=['daily_reference_rate']))
    return sorted(result, key=lambda row: row.period_date)

def normalize_gold(payload, fetched_at):
    if payload.get('symbol') != 'XAU' or payload.get('currency', 'USD') != 'USD':
        raise CollectorError('instrument_mismatch', 'Expected XAU priced in USD per troy ounce.')
    asof = stamp(payload.get('updatedAt'))
    if asof > fetched_at + timedelta(minutes=5):
        raise CollectorError('invalid_timestamp', 'Provider timestamp is in the future.')
    return Quote(number(payload.get('price'), positive=True), asof, fetched_at, 'USD', ['provider_reference_quote'])

def normalize_sge_bars(payload, start, end):
    result = {}
    for row in payload:
        trading_date = day(row['date'])
        if not start <= trading_date <= end:
            continue
        o, h, l, c = [number(row.get(key), positive=True) for key in ('open', 'high', 'low', 'close')]
        if not l <= min(o, c) <= max(o, c) <= h:
            raise CollectorError('invalid_ohlc', 'Provider OHLC values violate price bounds.')
        record = Bar(trading_date, datetime.combine(trading_date, time(), SHANGHAI), o, h, l, c)
        if trading_date in result and result[trading_date] != record:
            raise CollectorError('conflicting_duplicates', 'Provider returned conflicting daily bars.')
        result[trading_date] = record
    return [result[key] for key in sorted(result)]

def normalize_sge_quote(payload, fetched_at):
    candidates = []
    for row in payload:
        if row.get('品种') != 'Au99.99':
            raise CollectorError('instrument_mismatch', 'Expected SGE Au99.99.')
        try:
            price = number(row.get('现价'), positive=True)
        except CollectorError:
            continue
        try:
            source_update = datetime.strptime(str(row.get('更新时间')), '%Y年%m月%d日 %H:%M:%S').replace(tzinfo=SHANGHAI)
            clock = time.fromisoformat(str(row['时间']))
        except (ValueError, TypeError, KeyError):
            raise CollectorError('invalid_timestamp', 'SGE source update date/time is missing.') from None
        event = datetime.combine(source_update.date(), clock, SHANGHAI)
        flags = ['minute_reference_quote', 'date_from_source_update']
        # At a midnight rollover a previous evening row belongs to the previous civil date.
        if event > source_update and clock.hour >= 20 and source_update.hour < 6:
            event -= timedelta(days=1)
            flags.append('night_session_previous_date')
        elif event > source_update:
            continue
        if source_update > fetched_at + timedelta(minutes=5):
            raise CollectorError('invalid_timestamp', 'SGE source update is in the future.')
        candidates.append(Quote(price, event, fetched_at, 'CNY', flags))
    if not candidates:
        raise CollectorError('empty_response', 'No valid SGE quotation with source timestamp.')
    return max(candidates, key=lambda row: row.asof_at)

def fetch(series, start, end, client=None):
    client = client or JsonClient()
    provider, symbol = series['providerId'], series['providerSymbol']
    if provider == 'fred':
        key = os.getenv('FRED_API_KEY')
        if not key:
            raise CollectorError('not_configured', 'Set FRED_API_KEY on the server.')
        records, offset = [], 0
        while True:
            payload = client.get('https://api.stlouisfed.org/fred/series/observations', {'series_id': symbol, 'api_key': key, 'file_type': 'json', 'observation_start': start.isoformat(), 'observation_end': end.isoformat(), 'sort_order': 'asc', 'limit': 100000, 'offset': offset})
            page = normalize_fred(payload)
            records.extend(page)
            offset += len(page)
            if offset >= int(payload.get('count', offset)):
                return records
            if not page:
                raise CollectorError('invalid_response', 'FRED pagination stalled.')
    if provider == 'frankfurter':
        base, quote = symbol.split('/')
        return normalize_frankfurter(client.get('https://api.frankfurter.dev/v2/rates', {'from': start.isoformat(), 'to': end.isoformat(), 'base': base.lower(), 'quotes': quote.lower()}), symbol)
    if provider == 'gold_api':
        if symbol != 'XAU' or series['kind'] != 'quote':
            raise CollectorError('unsupported', 'Only the verified free XAU/USD quote is supported.')
        payload = client.get('https://api.gold-api.com/price/XAU')
        return [normalize_gold(payload, client.fetched_at or datetime.now(timezone.utc))]
    if provider == 'akshare_sge':
        if symbol != 'Au99.99':
            raise CollectorError('unsupported', 'Only the verified Au99.99 mapping is enabled.')
        # AKShare does not consistently expose request timeouts. Isolate its calls in a
        # bounded process so an unresponsive public site cannot hold the lock forever.
        try:
            process = subprocess.run([sys.executable, '-m', 'atlas_collector.sge_worker', 'quote' if series['kind'] == 'quote' else 'bars'], capture_output=True, text=True, timeout=75)
            if process.returncode:
                raise CollectorError('upstream_unavailable', 'AKShare/SGE request failed; prior records retained.')
            payload = json.loads(process.stdout)
        except subprocess.TimeoutExpired:
            raise CollectorError('upstream_timeout', 'AKShare/SGE exceeded 75 seconds.') from None
        except (ValueError, OSError):
            raise CollectorError('invalid_response', 'AKShare returned an invalid response.') from None
        return [normalize_sge_quote(payload, datetime.now(timezone.utc))] if series['kind'] == 'quote' else normalize_sge_bars(payload, start, end)
    raise CollectorError('unsupported', 'This provider has no automated V1 collector.')
