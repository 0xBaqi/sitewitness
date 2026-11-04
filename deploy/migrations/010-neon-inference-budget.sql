-- Apply once with the migration role after 009-neon.sql.
-- Lifetime allowance imports are recorded separately. This migration deliberately
-- does not initialize/reset any counter; inference remains fail-closed until the
-- authoritative SQLite reservation count is imported by the operator script.
BEGIN;
CREATE TABLE IF NOT EXISTS sw_counter_imports (
  name text NOT NULL,
  source_sha256 char(64) NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  source_count bigint NOT NULL CHECK (source_count >= 0),
  source_until_ms bigint NOT NULL CHECK (source_until_ms >= 0),
  imported_at_ms bigint NOT NULL CHECK (imported_at_ms >= 0),
  PRIMARY KEY (name, source_sha256)
);
COMMIT;
