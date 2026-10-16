"""Run: python -m atlas_collector sync --series SGE_AU9999_D1 --probe."""
import argparse
from dataclasses import asdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import json
import os
from pathlib import Path
import sys
from .adapters import fetch
from .errors import CollectorError
from .http import JsonClient
from .store import Store, live_only


def json_default(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    raise TypeError


def main(argv=None):
    parser = argparse.ArgumentParser(description='Collect real upstream financial data. Probe does not require a database.')
    parser.add_argument('command', choices=['sync', 'backfill'])
    parser.add_argument('--series', required=True)
    parser.add_argument('--start', type=date.fromisoformat)
    parser.add_argument('--end', type=date.fromisoformat)
    parser.add_argument('--probe', action='store_true')
    args = parser.parse_args(argv)
    try:
        if not args.probe:
            live_only()
        catalog_path = Path(os.getenv('ATLAS_CATALOG_PATH', str(Path(__file__).resolve().parents[4] / 'config/indicators.json')))
        catalog = json.loads(catalog_path.read_text())
        series = next((item for item in catalog if item['id'] == args.series and item.get('enabled', True)), None)
        if series is None:
            raise CollectorError('unknown_series', 'Series is not enabled in the indicator catalog.')
        end = args.end or datetime.now(timezone.utc).date()
        start = args.start or end - timedelta(days=365*3 + 1)
        if start > end:
            raise CollectorError('invalid_range', 'Start must be on or before end.')
        client = JsonClient()
        if args.probe:
            records = fetch(series, start, end, client)
            if not records:
                raise CollectorError('empty_response', 'No upstream records in this date range.')
            print(json.dumps({'seriesId':series['id'], 'providerId':series['providerId'], 'sourceUrl':series['sourceUrl'], 'fetchedAt':datetime.now(timezone.utc), 'count':len(records), 'records':[asdict(record) for record in records]}, default=json_default, ensure_ascii=False))
            return 0
        if not os.getenv('DATABASE_URL'):
            raise CollectorError('not_configured', 'Set DATABASE_URL on the server.')
        import psycopg
        with psycopg.connect(os.environ['DATABASE_URL'], autocommit=True, connect_timeout=10) as connection:
            if not connection.execute('SELECT 1 FROM series WHERE id=%s', (series['id'],)).fetchone():
                raise CollectorError('not_configured', 'Run database migrations and catalog seed first.')
            # Incremental sync rechecks two calendar weeks (at least seven normal trading days).
            # Initial sync and backfill default to three years.
            if args.command == 'sync' and not args.start and series['kind'] != 'quote':
                table, column = ('price_bars','trading_date') if series['kind'] == 'ohlc' else ('metric_observations','period_date')
                latest = connection.execute(f'SELECT max({column}) FROM {table} WHERE series_id=%s', (series['id'],)).fetchone()[0]
                if latest:
                    start = min(latest - timedelta(days=14), end)
            result = Store(connection).run(series, args.command, lambda: fetch(series,start,end,client), cache_seconds=(lambda:max(30,client.cache_seconds)) if series['providerId']=='gold_api' else 0)
            print(json.dumps({'seriesId':series['id'],**result}))
        return 0
    except CollectorError as error:
        print(json.dumps({'code':error.code, 'message':str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130
    except Exception:
        print(json.dumps({'code':'collection_failed', 'message':'Collection failed. Check server configuration and upstream availability; prior records retained.'}), file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())
