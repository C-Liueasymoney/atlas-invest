"""Upstream fixtures are deliberately small, hand-checked protocol examples."""
from datetime import date, datetime, timezone
from decimal import Decimal
import json
import subprocess
import sys
import pytest
from atlas_collector.adapters import normalize_fred, normalize_frankfurter, normalize_gold, normalize_sge_bars, normalize_sge_quote
from atlas_collector.errors import CollectorError
from atlas_collector.http import JsonClient

NOW = datetime(2026, 10, 16, 8, tzinfo=timezone.utc)


def test_fred_missing_is_null_and_period_is_not_publication():
    rows = normalize_fred({'observations': [
        {'date': '2026-10-14', 'value': '.', 'realtime_start': '2026-10-16', 'realtime_end': '2026-10-16'},
        {'date': '2026-10-15', 'value': '1.2300000001', 'realtime_start': '2026-10-16', 'realtime_end': '2026-10-16'},
    ]})
    assert rows[0].value is None
    assert rows[0].period_date == date(2026, 10, 14)
    assert rows[0].published_at is None
    assert rows[0].observed_at is None
    assert rows[1].value == Decimal('1.2300000001')


def test_frankfurter_checks_pair_and_preserves_daily_date():
    row = normalize_frankfurter([{'date': '2026-10-15', 'base': 'USD', 'quote': 'CNY', 'rate': '7.123456789'}], 'USD/CNY')[0]
    assert row.period_date == date(2026, 10, 15)
    assert row.value == Decimal('7.123456789')
    with pytest.raises(CollectorError):
        normalize_frankfurter([{'date': '2026-10-15', 'base': 'USD', 'quote': 'CNH', 'rate': 7}], 'USD/CNY')


def test_gold_requires_source_timestamp_and_matching_currency():
    row = normalize_gold({'symbol': 'XAU', 'currency': 'USD', 'price': '4165.200195', 'updatedAt': '2026-10-16T07:59:30Z'}, NOW)
    assert row.value == Decimal('4165.200195')
    assert row.asof_at.isoformat() == '2026-10-16T07:59:30+00:00'
    assert row.fetched_at == NOW
    for bad in [{'symbol': 'XAU', 'price': 2}, {'symbol': 'XAU', 'currency': 'CNY', 'price': 2, 'updatedAt': '2026-10-16T07:59:30Z'}]:
        with pytest.raises(CollectorError):
            normalize_gold(bad, NOW)


def test_sge_bars_sort_deduplicate_and_never_invent_volume():
    rows = normalize_sge_bars([
        {'date': '2026-10-15', 'open': 930, 'high': 935, 'low': 928, 'close': '932.10'},
        {'date': '2026-10-14', 'open': 920, 'high': 930, 'low': 919, 'close': 925},
        {'date': '2026-10-15', 'open': 930, 'high': 935, 'low': 928, 'close': '932.10'},
    ], date(2026, 10, 14), date(2026, 10, 15))
    assert len(rows) == 2
    assert rows[0].trading_date == date(2026, 10, 14)
    assert rows[0].bar_time.isoformat() == '2026-10-14T00:00:00+08:00'
    assert rows[1].close == Decimal('932.10')
    assert rows[1].volume is None
    assert rows[1].observed_at is None


def test_invalid_ohlc_aborts_batch_instead_of_silently_dropping_it():
    with pytest.raises(CollectorError):
        normalize_sge_bars([{'date': '2026-10-15', 'open': 930, 'high': 929, 'low': 928, 'close': 932}], date(2026, 10, 1), date(2026, 10, 16))


def test_sge_night_session_uses_source_date_and_latest_valid_event():
    rows = [
        {'品种': 'Au99.99', '时间': '23:59:00', '现价': 932, '更新时间': '2026年10月15日 00:02:10'},
        {'品种': 'Au99.99', '时间': '00:01:00', '现价': 933, '更新时间': '2026年10月15日 00:02:10'},
        {'品种': 'Au99.99', '时间': '00:02:00', '现价': None, '更新时间': '2026年10月15日 00:02:10'},
    ]
    row = normalize_sge_quote(rows, NOW)
    assert row.value == Decimal('933')
    assert row.asof_at.isoformat() == '2026-10-15T00:01:00+08:00'
    assert 'minute_reference_quote' in row.quality_flags


def test_sge_quote_rejects_missing_source_date():
    with pytest.raises(CollectorError):
        normalize_sge_quote([{'品种': 'Au99.99', '时间': '10:00:00', '现价': 932, '更新时间': None}], NOW)


def test_decimal_rejects_nonfinite_prices():
    for bad in ['NaN', 'Infinity', '-1', '0']:
        with pytest.raises(CollectorError):
            normalize_gold({'symbol': 'XAU', 'price': bad, 'updatedAt': '2026-10-16T07:59:30Z'}, NOW)


def test_demo_cli_rejects_write_before_connecting_to_database(monkeypatch):
    import os
    env = dict(os.environ, DATA_MODE='demo', DATABASE_URL='postgresql://nobody:secret@127.0.0.1:1/no')
    result = subprocess.run([sys.executable, '-m', 'atlas_collector', 'sync', '--series', 'XAUUSD_QUOTE'], env=env, capture_output=True, text=True)
    assert result.returncode == 1
    assert json.loads(result.stderr)['code'] == 'demo_write_forbidden'
    assert 'secret' not in result.stderr


def test_http_retry_is_bounded_and_does_not_expose_credentials():
    from urllib.error import HTTPError
    attempts = []
    def fail(request, **kwargs):
        attempts.append(1)
        raise HTTPError(request.full_url, 503, 'private api_key=secret', {}, None)
    client = JsonClient(opener=fail, sleep=lambda _: None)
    with pytest.raises(CollectorError) as error:
        client.get('https://example.com', {'api_key': 'secret'})
    assert len(attempts) == 3
    assert 'secret' not in str(error.value)


def test_http_unauthorized_does_not_retry():
    from urllib.error import HTTPError
    attempts = []
    def fail(request, **kwargs):
        attempts.append(1)
        raise HTTPError(request.full_url, 401, 'secret', {}, None)
    with pytest.raises(CollectorError) as error:
        JsonClient(opener=fail, sleep=lambda _: None).get('https://example.com')
    assert error.value.code == 'unauthorized'
    assert len(attempts) == 1


def test_fred_fetch_paginates_with_one_shared_environment_credential(monkeypatch):
    from atlas_collector.adapters import fetch
    monkeypatch.setenv('FRED_API_KEY', 'server-only')
    class Pages:
        def get(self, url, params):
            assert params['api_key'] == 'server-only'
            if params['offset'] == 0:
                return {'count': 2, 'observations': [{'date': '2026-10-14', 'value': '.'}]}
            assert params['offset'] == 1
            return {'count': 2, 'observations': [{'date': '2026-10-15', 'value': '1.23'}]}
    rows = fetch({'providerId':'fred','providerSymbol':'DFII10'}, date(2026,10,14), date(2026,10,15), Pages())
    assert [row.value for row in rows] == [None, Decimal('1.23')]


def test_fred_missing_key_fails_without_network(monkeypatch):
    from atlas_collector.adapters import fetch
    monkeypatch.delenv('FRED_API_KEY', raising=False)
    with pytest.raises(CollectorError) as error:
        fetch({'providerId':'fred','providerSymbol':'DGS10'}, date(2026,10,14), date(2026,10,15))
    assert error.value.code == 'not_configured'


def test_http_preserves_decimal_precision_and_cache_control():
    from io import BytesIO
    class Response(BytesIO):
        headers = {'Cache-Control':'public, max-age=65'}
    client = JsonClient(opener=lambda *args, **kwargs: Response(b'{"price": 123.1234567891}'))
    payload = client.get('https://example.com')
    assert payload['price'] == Decimal('123.1234567891')
    assert client.cache_seconds == 65
