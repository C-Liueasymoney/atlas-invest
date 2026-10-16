-- Additive provenance for uploaded data. Rollback can retain this unused column safely.
ALTER TABLE data_imports ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';
