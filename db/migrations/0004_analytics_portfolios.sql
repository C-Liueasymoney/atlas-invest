-- Owner-scoped hypothetical portfolios; no fabricated market observations.
CREATE TABLE IF NOT EXISTS analytics_portfolios (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
 config jsonb NOT NULL CHECK(jsonb_typeof(config)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_portfolios_owner ON analytics_portfolios(owner_id,updated_at DESC);
