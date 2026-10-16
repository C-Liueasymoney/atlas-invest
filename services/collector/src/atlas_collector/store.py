"""Transactional persistence against db/migrations/0001_initial.sql."""
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import hashlib
import json
import os
import time
import uuid
from psycopg.types.json import Jsonb
from .errors import CollectorError
from .models import Bar, Observation, Quote

def live_only():
    if os.getenv('DATA_MODE', 'demo') != 'live':
        raise CollectorError('demo_write_forbidden', 'Set DATA_MODE=live explicitly to write upstream data.')

def digest(value):
    return hashlib.sha256(json.dumps(value, default=str, sort_keys=True).encode()).hexdigest()

class Store:
    def __init__(self, connection):
        self.connection = connection

    def persist(self, series, records):
        live_only()
        inserted, updated = 0, 0
        with self.connection.transaction():
            table = {'ohlc':'price_bars','quote':'latest_quotes'}.get(series['kind'],'metric_observations')
            origins = self.connection.execute(f'SELECT DISTINCT provider_id FROM {table} WHERE series_id=%s', (series['id'],)).fetchall()
            if any(row[0] != series['providerId'] for row in origins):
                raise CollectorError('source_change_forbidden', 'Existing series provenance differs; create a separate series for another provider.')
            for record in records:
                sid, pid = series['id'], series['providerId']
                flags = Jsonb(record.quality_flags)
                if isinstance(record, Bar):
                    cursor = self.connection.execute('''INSERT INTO price_bars
                      (series_id,interval,bar_time,trading_date,open,high,low,close,volume,observed_at,provider_id,quality_flags)
                      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                      ON CONFLICT(series_id,interval,bar_time) DO UPDATE SET
                      open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close,
                      volume=excluded.volume, provider_id=excluded.provider_id, quality_flags=excluded.quality_flags,
                      ingested_at=now(),is_revised=true
                      WHERE (price_bars.open,price_bars.high,price_bars.low,price_bars.close,price_bars.volume,price_bars.provider_id,price_bars.quality_flags)
                      IS DISTINCT FROM (excluded.open,excluded.high,excluded.low,excluded.close,excluded.volume,excluded.provider_id,excluded.quality_flags)
                      RETURNING (xmax=0)''', (sid,series.get('frequency','1d'),record.bar_time,record.trading_date,record.open,record.high,record.low,record.close,record.volume,record.observed_at,pid,flags))
                elif isinstance(record, Observation):
                    old = self.connection.execute("SELECT value,published_at,provider_id,quality_flags FROM metric_observations WHERE series_id=%s AND period_date=%s AND revision_id='latest' FOR UPDATE", (sid,record.period_date)).fetchone()
                    if old and (old[0],old[1],old[2],old[3]) != (record.value,record.published_at,pid,record.quality_flags):
                        self.connection.execute('''INSERT INTO metric_observations
                          (series_id,period_date,value,published_at,observed_at,ingested_at,revision_id,provider_id,source_record_id,quality_flags)
                          SELECT series_id,period_date,value,published_at,observed_at,ingested_at,%s,provider_id,source_record_id,quality_flags
                          FROM metric_observations WHERE series_id=%s AND period_date=%s AND revision_id='latest'
                          ON CONFLICT DO NOTHING''', ('revised:'+digest(old),sid,record.period_date))
                    cursor = self.connection.execute('''INSERT INTO metric_observations
                      (series_id,period_date,value,published_at,observed_at,provider_id,quality_flags)
                      VALUES (%s,%s,%s,%s,%s,%s,%s)
                      ON CONFLICT(series_id,period_date,revision_id) DO UPDATE SET
                      value=excluded.value,published_at=excluded.published_at,observed_at=excluded.observed_at,
                      provider_id=excluded.provider_id,quality_flags=excluded.quality_flags,ingested_at=now()
                      WHERE (metric_observations.value,metric_observations.published_at,metric_observations.provider_id,metric_observations.quality_flags)
                      IS DISTINCT FROM (excluded.value,excluded.published_at,excluded.provider_id,excluded.quality_flags)
                      RETURNING (xmax=0)''',(sid,record.period_date,record.value,record.published_at,record.observed_at,pid,flags))
                elif isinstance(record, Quote):
                    cursor = self.connection.execute('''INSERT INTO latest_quotes
                      (series_id,value,currency,asof_at,fetched_at,provider_id,provider_payload_hash,quality_flags,market_state)
                      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                      ON CONFLICT(series_id) DO UPDATE SET value=excluded.value,currency=excluded.currency,
                      asof_at=excluded.asof_at,fetched_at=excluded.fetched_at,provider_id=excluded.provider_id,
                      provider_payload_hash=excluded.provider_payload_hash,quality_flags=excluded.quality_flags,
                      market_state=excluded.market_state
                      WHERE excluded.asof_at >= latest_quotes.asof_at
                      AND (latest_quotes.value,latest_quotes.asof_at,latest_quotes.provider_id,latest_quotes.quality_flags)
                      IS DISTINCT FROM (excluded.value,excluded.asof_at,excluded.provider_id,excluded.quality_flags)
                      RETURNING (xmax=0)''',(sid,record.value,record.currency,record.asof_at,record.fetched_at,pid,digest({'value':record.value,'asof_at':record.asof_at}),flags,record.market_state))
                else:
                    raise CollectorError('invalid_record', 'Unsupported normalized record type.')
                result = cursor.fetchone()
                if result:
                    inserted += int(result[0])
                    updated += int(not result[0])
        return inserted, updated

    def guard(self, series):
        c = self.connection
        provider = c.execute('SELECT enabled,config FROM providers WHERE id=%s', (series['providerId'],)).fetchone()
        if not provider or not provider[0]:
            raise CollectorError('provider_disabled', 'Provider is disabled; scheduled collection paused.')
        enabled = c.execute('SELECT is_enabled FROM series WHERE id=%s', (series['id'],)).fetchone()
        if not enabled or not enabled[0]:
            raise CollectorError('series_disabled', 'Series is disabled; collection paused.')
        operation = {'ohlc':'bars','quote':'quote'}.get(series['kind'],'observations')
        routes = c.execute('SELECT provider_id,provider_symbol,enabled,constraints_json,mode FROM series_provider_routes WHERE canonical_series_id=%s AND operation=%s AND interval=%s ORDER BY priority', (series['id'],operation,series.get('frequency','1d'))).fetchall()
        if routes:
            candidates = [r for r in routes if r[2]]
            if not candidates or candidates[0][0] != series['providerId'] or candidates[0][1] != series.get('providerSymbol',candidates[0][1]):
                raise CollectorError('route_unavailable', 'Configured primary route differs or is disabled; use the server route controller.')
            constraints = candidates[0][3]
            if any(key in constraints and key in series and constraints[key] != series[key] for key in ('unit','currency','market','priceDefinition','frequency')):
                raise CollectorError('route_unavailable', 'Configured route has incompatible instrument constraints.')
        return provider[1]

    def reserve(self, series):
        c = self.connection
        with c.transaction():
            c.execute('SELECT pg_advisory_xact_lock(hashtext(%s))', ('provider:'+series['providerId'],))
            config = self.guard(series)
            for key, seconds, default in [('perMinute',60,5),('perHour',3600,100),('perDay',86400,{'akshare_sge':100,'gold_api':2000,'frankfurter':1000,'fred':1000}.get(series['providerId'],1000))]:
                try:
                    limit = int(config.get(key,default))
                except (ValueError,TypeError):
                    raise CollectorError('invalid_config', 'Provider request budget is invalid.') from None
                count = c.execute("SELECT count(*) FROM provider_request_usage WHERE provider_id=%s AND requested_at>now()-(%s * interval '1 second') AND cache_hit=false", (series['providerId'],seconds)).fetchone()[0]
                if limit < 1 or count >= limit:
                    raise CollectorError('rate_limited', 'Provider local request budget exhausted; collection paused.')
            usage_id = uuid.uuid4()
            c.execute("INSERT INTO provider_request_usage(id,provider_id,result_type) VALUES (%s,%s,'reserved')", (usage_id,series['providerId']))
        return usage_id

    def run(self, series, job_type, fetch, cache_seconds=0):
        live_only()
        c = self.connection
        lock_key = 'atlas:series:' + series['id']
        if not c.execute('SELECT pg_try_advisory_lock(hashtextextended(%s,0))', (lock_key,)).fetchone()[0]:
            raise CollectorError('already_running', 'Another collector is processing this series.')
        run_id, started = uuid.uuid4(), time.monotonic()
        usage_id = None
        provider_locked = False
        try:
            provider_locked = c.execute('SELECT pg_try_advisory_lock(hashtext(%s))', ('provider:'+series['providerId'],)).fetchone()[0]
            if not provider_locked:
                raise CollectorError('provider_busy', 'Provider is processing another request; retry later.')
            c.execute("INSERT INTO ingest_runs(id,provider_id,job_type,series_id,status,source_url) VALUES (%s,%s,%s,%s,'running',%s)", (run_id,series['providerId'],job_type,series['id'],series.get('sourceUrl')))
            try:
                self.guard(series)
                cache_key = 'collector:' + series['id']
                cached = c.execute('SELECT 1 FROM provider_cache WHERE cache_key=%s AND expires_at>now()', (cache_key,)).fetchone()
                if cached and cache_seconds:
                    records, counts, status = [], (0, 0), 'cached'
                else:
                    usage_id = self.reserve(series)
                    records = fetch()
                    if not records:
                        raise CollectorError('empty_response', 'Provider returned no records in the requested range.')
                    counts = self.persist(series, records)
                    status = 'success'
                    if cache_seconds:
                        c.execute('''INSERT INTO provider_cache(cache_key,provider_id,payload,expires_at) VALUES (%s,%s,'{}',%s)
                          ON CONFLICT(cache_key) DO UPDATE SET expires_at=excluded.expires_at''',(cache_key,series['providerId'],datetime.now(timezone.utc)+timedelta(seconds=cache_seconds() if callable(cache_seconds) else cache_seconds)))
                c.execute("UPDATE ingest_runs SET status=%s,finished_at=now(),inserted_count=%s,updated_count=%s,duration_ms=%s WHERE id=%s",(status,*counts,int((time.monotonic()-started)*1000),run_id))
                c.execute('UPDATE providers SET last_success_at=now(),last_error=NULL WHERE id=%s',(series['providerId'],))
                if usage_id:
                    c.execute('UPDATE provider_request_usage SET result_type=%s WHERE id=%s',(status,usage_id))
                else:
                    c.execute("INSERT INTO provider_request_usage(id,provider_id,result_type,cache_hit) VALUES (%s,%s,%s,true)",(uuid.uuid4(),series['providerId'],status))
                return {'runId': str(run_id), 'status':status, 'inserted':counts[0], 'updated':counts[1], 'count':len(records)}
            except Exception as error:
                safe = error if isinstance(error, CollectorError) else CollectorError('collection_failed', 'Collection failed; existing records retained. Check server configuration and upstream availability.')
                c.execute("UPDATE ingest_runs SET status='failed',finished_at=now(),error_code=%s,error_message=%s,duration_ms=%s WHERE id=%s",(safe.code,str(safe),int((time.monotonic()-started)*1000),run_id))
                c.execute('UPDATE providers SET last_error=%s WHERE id=%s',(str(safe),series['providerId']))
                if usage_id:
                    c.execute("UPDATE provider_request_usage SET result_type='failed',error_category=%s WHERE id=%s",(safe.code,usage_id))
                raise safe from None
        finally:
            if provider_locked:
                c.execute('SELECT pg_advisory_unlock(hashtext(%s))',('provider:'+series['providerId'],))
            c.execute('SELECT pg_advisory_unlock(hashtextextended(%s,0))',(lock_key,))
