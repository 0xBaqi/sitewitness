-- Apply once using the operator's migration connection, never from a request.
BEGIN;
CREATE TABLE IF NOT EXISTS sw_lock (id integer PRIMARY KEY CHECK (id=1));
INSERT INTO sw_lock VALUES (1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS sw_counters (name text PRIMARY KEY, count integer NOT NULL, until_ms bigint NOT NULL);
CREATE TABLE IF NOT EXISTS sw_snapshots (
 id uuid PRIMARY KEY, owner text NOT NULL, fingerprint text NOT NULL,
 data text NOT NULL, expires bigint NOT NULL, pending_until bigint NOT NULL,
 state text NOT NULL CHECK (state IN ('pending','ready','deleted')),
 allocation bigint NOT NULL CHECK (allocation>=0), cleaned_at bigint
);
CREATE INDEX IF NOT EXISTS sw_owner ON sw_snapshots(owner,id);
CREATE TABLE IF NOT EXISTS sw_photos (
 snapshot uuid NOT NULL REFERENCES sw_snapshots(id) ON DELETE CASCADE,
 id uuid NOT NULL, path text NOT NULL UNIQUE, uploaded boolean NOT NULL DEFAULT false,
 PRIMARY KEY(snapshot,id)
);
COMMIT;
