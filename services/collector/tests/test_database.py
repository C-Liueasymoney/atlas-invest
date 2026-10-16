"""Run against a disposable PostgreSQL schema with TEST_DATABASE_URL."""
from datetime import date, datetime, timezone
from decimal import Decimal
import os
from pathlib import Path
import uuid
import pytest
from atlas_collector.store import Store
from atlas_collector.models import Bar, Observation, Quote
from atlas_collector.errors import CollectorError

@pytest.fixture
def db(monkeypatch):
    url = os.getenv('TEST_DATABASE_URL')
    if not url:
        pytest.skip('TEST_DATABASE_URL not set: PostgreSQL integration requires a real server')
    import psycopg
    monkeypatch.setenv('DATA_MODE', 'live')
    schema = 'collector_test_' + uuid.uuid4().hex
    connection = psycopg.connect(url, autocommit=True)
    connection.execute(f'CREATE SCHEMA {schema}')
    connection.execute(f'SET search_path TO {schema}')
    connection.execute(Path(__file__).resolve().parents[3].joinpath('db/migrations/0001_initial.sql').read_text())
    connection.execute("INSERT INTO providers(id,name) VALUES ('fred','FRED')")
    connection.execute("INSERT INTO series(id,provider_id,provider_series_id,name_zh,kind,frequency,unit,timezone,description,source_url,stale_policy,metadata) VALUES ('TEST','fred','TEST','test','observation','1d','percent','UTC','test','https://example.com','{}','{}')")
    try:
        yield Store(connection)
    finally:
        connection.execute('SET search_path TO public')
        connection.execute(f'DROP SCHEMA {schema} CASCADE')
        connection.close()


def test_upsert_is_idempotent_and_archives_revised_observations(db):
    series = {'id': 'TEST', 'providerId': 'fred', 'kind': 'observation'}
    assert db.persist(series, [Observation(date(2026, 10, 15), Decimal('1.2'))]) == (1, 0)
    assert db.persist(series, [Observation(date(2026, 10, 15), Decimal('1.2'))]) == (0, 0)
    assert db.persist(series, [Observation(date(2026, 10, 15), Decimal('1.3'))]) == (0, 1)
    rows = db.connection.execute('SELECT revision_id,value FROM metric_observations ORDER BY revision_id').fetchall()
    assert len(rows) == 2
    assert ('latest', Decimal('1.3')) in rows
    assert any(row[1] == Decimal('1.2') for row in rows)


def test_transaction_rolls_back_entire_batch_after_invalid_record(db):
    series = {'id': 'TEST', 'providerId': 'fred', 'kind': 'ohlc', 'frequency': '1d'}
    instant = datetime(2026, 10, 15, tzinfo=timezone.utc)
    with pytest.raises(Exception):
        db.persist(series, [Bar(date(2026, 10, 15), instant, Decimal(1), Decimal(2), Decimal(1), Decimal(2)), Bar(date(2026, 10, 16), instant.replace(day=16), Decimal(5), Decimal(2), Decimal(1), Decimal(3))])
    assert db.connection.execute('SELECT count(*) FROM price_bars').fetchone()[0] == 0


def test_quote_does_not_replace_newer_source_data_with_older(db):
    series = {'id': 'TEST', 'providerId': 'fred', 'kind': 'quote'}
    newer = datetime(2026, 10, 15, tzinfo=timezone.utc)
    old = datetime(2026, 10, 14, tzinfo=timezone.utc)
    assert db.persist(series, [Quote(Decimal(3), newer, newer, 'USD')]) == (1, 0)
    assert db.persist(series, [Quote(Decimal(2), old, newer, 'USD')]) == (0, 0)
    assert db.connection.execute('SELECT value FROM latest_quotes').fetchone()[0] == Decimal(3)


def test_failed_fetch_retains_last_data_and_records_safe_failure(db):
    series = {'id': 'TEST', 'providerId': 'fred', 'kind': 'observation', 'sourceUrl': 'https://example.com'}
    db.persist(series, [Observation(date(2026, 10, 15), Decimal('1.2'))])
    def fail():
        raise RuntimeError('password=never-log-this')
    with pytest.raises(CollectorError):
        db.run(series, 'sync', fail)
    assert db.connection.execute('SELECT value FROM metric_observations').fetchone()[0] == Decimal('1.2')
    row = db.connection.execute('SELECT status,error_message FROM ingest_runs').fetchone()
    assert row[0] == 'failed'
    assert 'never-log-this' not in row[1]


def test_gold_cache_honors_longer_upstream_cache_control(db):
    series = {'id':'TEST','providerId':'fred','kind':'quote','sourceUrl':'https://example.com'}
    now = datetime.now(timezone.utc)
    assert db.run(series, 'sync', lambda:[Quote(Decimal(3),now,now,'USD')], cache_seconds=lambda:65)['status'] == 'success'
    remaining = db.connection.execute("SELECT extract(epoch FROM expires_at-now()) FROM provider_cache").fetchone()[0]
    assert 60 <= remaining <= 65
    def must_not_fetch():
        raise AssertionError('cached request reached upstream')
    assert db.run(series,'sync',must_not_fetch,cache_seconds=lambda:65)['status'] == 'cached'
