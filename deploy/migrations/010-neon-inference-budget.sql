-- Apply after 009-neon.sql. Historical SQLite reservations could not be recovered;
-- this creates a separately auditable finite epoch and does not alter old counters.
BEGIN;
CREATE TABLE IF NOT EXISTS sw_counter_imports (
  name text NOT NULL,
  source_sha256 char(64) NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  source_count bigint NOT NULL CHECK (source_count >= 0),
  source_until_ms bigint NOT NULL CHECK (source_until_ms >= 0),
  imported_at_ms bigint NOT NULL CHECK (imported_at_ms >= 0),
  PRIMARY KEY (name, source_sha256)
);
CREATE TABLE IF NOT EXISTS sw_inference_epochs (
  id text PRIMARY KEY,
  legacy_lifetime_state text NOT NULL CHECK (legacy_lifetime_state IN ('imported','unknown')),
  global_daily_limit integer NOT NULL CHECK (global_daily_limit > 0),
  per_identity_daily_limit integer NOT NULL CHECK (per_identity_daily_limit > 0),
  lifetime_limit integer NOT NULL CHECK (lifetime_limit > 0),
  created_at_ms bigint NOT NULL CHECK (created_at_ms >= 0)
);
INSERT INTO sw_inference_epochs(id,legacy_lifetime_state,global_daily_limit,per_identity_daily_limit,lifetime_limit,created_at_ms)
VALUES ('judge-v1-legacy-unknown','unknown',5,2,10,(extract(epoch FROM clock_timestamp())*1000)::bigint)
ON CONFLICT (id) DO NOTHING;
COMMIT;
