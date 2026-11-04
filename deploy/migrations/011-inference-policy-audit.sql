-- Audit metadata for the in-place finite judge-allowance increase.
-- No reservation or usage counter is modified by this migration.
BEGIN;
CREATE TABLE IF NOT EXISTS sw_inference_policy_audit (
  revision text PRIMARY KEY,
  epoch_id text NOT NULL,
  reason text NOT NULL,
  prior_limits jsonb NOT NULL,
  new_limits jsonb NOT NULL,
  prior_counters jsonb NOT NULL,
  prior_exhausted_gates jsonb NOT NULL,
  applied_at_ms bigint NOT NULL CHECK (applied_at_ms >= 0)
);
COMMIT;
