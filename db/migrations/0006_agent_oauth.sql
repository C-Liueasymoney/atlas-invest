-- Server-side OAuth credentials never appear in copied research instructions.
CREATE TABLE IF NOT EXISTS agent_oauth_state (
 owner_id uuid PRIMARY KEY,
 state jsonb NOT NULL CHECK(jsonb_typeof(state)='object')
);
