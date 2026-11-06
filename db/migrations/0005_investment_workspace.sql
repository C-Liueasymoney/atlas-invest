-- Owner-scoped research state. Every mutation holds this row lock through commit.
-- Tasks, immutable snapshots, result receipt, and decision review association commit together.
CREATE TABLE IF NOT EXISTS investment_workspaces (
  owner_id uuid PRIMARY KEY,
  state jsonb NOT NULL DEFAULT '{"holdings":[],"decisions":[],"tasks":[],"results":[]}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT investment_state_object CHECK (jsonb_typeof(state) = 'object')
);
