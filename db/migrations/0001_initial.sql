-- Initial, additive schema. No source secrets or demo prices seeded.
CREATE TABLE IF NOT EXISTS providers (
 id text PRIMARY KEY, name text NOT NULL, enabled boolean NOT NULL DEFAULT true,
 config jsonb NOT NULL DEFAULT '{}', last_success_at timestamptz, last_error text
);
CREATE TABLE IF NOT EXISTS instruments (
 id text PRIMARY KEY, symbol text NOT NULL, display_name text NOT NULL, asset_class text NOT NULL,
 market text NOT NULL, quote_currency text NOT NULL, base_unit text NOT NULL, timezone text NOT NULL,
 is_tradable_reference boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS series (
 id text PRIMARY KEY, provider_id text NOT NULL REFERENCES providers(id), instrument_id text REFERENCES instruments(id),
 provider_series_id text NOT NULL, name_zh text NOT NULL, kind text NOT NULL, frequency text NOT NULL,
 unit text NOT NULL, timezone text NOT NULL, description text NOT NULL, source_url text NOT NULL,
 is_enabled boolean NOT NULL DEFAULT true, stale_policy jsonb NOT NULL, metadata jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS price_bars (
 series_id text NOT NULL REFERENCES series(id), interval text NOT NULL, bar_time timestamptz NOT NULL,
 trading_date date NOT NULL, open numeric(24,10) NOT NULL, high numeric(24,10) NOT NULL,
 low numeric(24,10) NOT NULL, close numeric(24,10) NOT NULL, volume numeric(28,10),
 observed_at timestamptz, ingested_at timestamptz NOT NULL DEFAULT now(), is_revised boolean NOT NULL DEFAULT false,
 provider_id text NOT NULL REFERENCES providers(id), source_record_id text, quality_flags jsonb NOT NULL DEFAULT '[]',
 PRIMARY KEY(series_id,interval,bar_time), CHECK(low <= high AND low <= open AND low <= close AND high >= open AND high >= close)
);
CREATE INDEX IF NOT EXISTS bars_series_date ON price_bars(series_id,trading_date DESC);
CREATE TABLE IF NOT EXISTS metric_observations (
 series_id text NOT NULL REFERENCES series(id), period_date date NOT NULL, period_end date,
 value numeric(24,10), published_at timestamptz, observed_at timestamptz,
 ingested_at timestamptz NOT NULL DEFAULT now(), revision_id text NOT NULL DEFAULT 'latest',
 provider_id text NOT NULL REFERENCES providers(id), source_record_id text, quality_flags jsonb NOT NULL DEFAULT '[]',
 PRIMARY KEY(series_id,period_date,revision_id)
);
CREATE TABLE IF NOT EXISTS latest_quotes (
 series_id text PRIMARY KEY REFERENCES series(id), value numeric(24,10) NOT NULL, currency text,
 asof_at timestamptz NOT NULL, fetched_at timestamptz NOT NULL, provider_id text NOT NULL REFERENCES providers(id),
 provider_payload_hash text, quality_flags jsonb NOT NULL DEFAULT '[]', market_state text NOT NULL DEFAULT 'unknown'
);
CREATE TABLE IF NOT EXISTS ingest_runs (
 id uuid PRIMARY KEY, provider_id text NOT NULL REFERENCES providers(id), job_type text NOT NULL, series_id text,
 started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, status text NOT NULL,
 inserted_count integer NOT NULL DEFAULT 0, updated_count integer NOT NULL DEFAULT 0,
 error_code text, error_message text, source_url text, duration_ms integer
);
CREATE TABLE IF NOT EXISTS provider_credentials (
 id uuid PRIMARY KEY, provider_id text NOT NULL REFERENCES providers(id), owner_id uuid NOT NULL,
 secret_ciphertext text NOT NULL, secret_last4 text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider_id,owner_id)
);
CREATE TABLE IF NOT EXISTS provider_capabilities (
 provider_id text NOT NULL REFERENCES providers(id), operation text NOT NULL, interval text NOT NULL,
 symbol text NOT NULL, status text NOT NULL, source_url text NOT NULL, checked_at timestamptz NOT NULL,
 PRIMARY KEY(provider_id,operation,interval,symbol)
);
CREATE TABLE IF NOT EXISTS series_provider_routes (
 canonical_series_id text NOT NULL REFERENCES series(id), provider_id text NOT NULL REFERENCES providers(id),
 provider_symbol text NOT NULL, operation text NOT NULL, interval text NOT NULL, priority integer NOT NULL DEFAULT 0,
 enabled boolean NOT NULL DEFAULT true, constraints_json jsonb NOT NULL, mode text NOT NULL DEFAULT 'auto',
 PRIMARY KEY(canonical_series_id,provider_id,operation,interval)
);
CREATE TABLE IF NOT EXISTS provider_request_usage (
 id uuid PRIMARY KEY, provider_id text NOT NULL REFERENCES providers(id), requested_at timestamptz NOT NULL DEFAULT now(),
 result_type text NOT NULL, cache_hit boolean NOT NULL DEFAULT false, error_category text
);
CREATE INDEX IF NOT EXISTS usage_provider_time ON provider_request_usage(provider_id,requested_at);
CREATE TABLE IF NOT EXISTS provider_health_checks (
 id uuid PRIMARY KEY, provider_id text NOT NULL REFERENCES providers(id), status text NOT NULL,
 checked_at timestamptz NOT NULL, sample_data_asof timestamptz, message text NOT NULL, error_code text
);
CREATE TABLE IF NOT EXISTS provider_cache (
 cache_key text PRIMARY KEY, provider_id text NOT NULL REFERENCES providers(id), payload jsonb NOT NULL,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dashboards (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, name text NOT NULL, layout_version integer NOT NULL DEFAULT 1,
 is_default boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dashboard_widgets (
 id uuid PRIMARY KEY, dashboard_id uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE, type text NOT NULL,
 title text, config jsonb NOT NULL, layout_desktop jsonb NOT NULL, layout_tablet jsonb NOT NULL DEFAULT '{}',
 layout_mobile jsonb NOT NULL DEFAULT '{}', schema_version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS watchlists (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, name text NOT NULL, sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS watchlist_items (
 watchlist_id uuid NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE, series_id text NOT NULL REFERENCES series(id),
 sort_order integer NOT NULL DEFAULT 0, added_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(watchlist_id,series_id)
);
CREATE TABLE IF NOT EXISTS alerts (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, series_id text NOT NULL REFERENCES series(id), condition_type text NOT NULL,
 params jsonb NOT NULL, enabled boolean NOT NULL DEFAULT true, cooldown_seconds integer NOT NULL DEFAULT 3600,
 state jsonb NOT NULL DEFAULT '{}', last_evaluated_at timestamptz, last_fired_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS alert_events (
 id uuid PRIMARY KEY, alert_id uuid NOT NULL REFERENCES alerts(id) ON DELETE CASCADE, triggered_at timestamptz NOT NULL,
 observed_value numeric(24,10), threshold numeric(24,10), series_asof_at timestamptz,
 delivered_channels jsonb NOT NULL DEFAULT '["in_app"]', dedup_key text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'recorded'
);
CREATE TABLE IF NOT EXISTS data_imports (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, provider_id text NOT NULL REFERENCES providers(id), dataset_type text NOT NULL,
 file_name text NOT NULL, file_sha256 text NOT NULL, stat_period_end date, released_at timestamptz,
 imported_at timestamptz NOT NULL DEFAULT now(), row_count integer NOT NULL, mapping_version integer NOT NULL DEFAULT 1,
 status text NOT NULL, source_url text NOT NULL, error_json jsonb, UNIQUE(owner_id,file_sha256,dataset_type)
);
CREATE TABLE IF NOT EXISTS research_notes (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, title text NOT NULL, markdown text NOT NULL,
 tags jsonb NOT NULL DEFAULT '[]', series_ids jsonb NOT NULL DEFAULT '[]', event_date date,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, action text NOT NULL, resource_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
