CREATE TABLE IF NOT EXISTS market_related_preferences (
 owner_id uuid NOT NULL,
 series_id text NOT NULL REFERENCES series(id),
 related_ids jsonb NOT NULL CHECK(jsonb_typeof(related_ids)='array'),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,series_id)
);
