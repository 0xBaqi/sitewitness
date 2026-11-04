# Vercel Preview live inference gate

Status: implementation and synthetic tests are ready for review. **Hosted backend acceptance is NOT passed. Live inference stays disabled.** No Preview deployment/configuration was changed and no Meta request was sent.

## Serverless design

- `/api/analyze` detects Vercel and uses the existing pooled Neon connection policy (`DATABASE_URL`, `-pooler.` hostname, verified TLS) and `sw_lock`/`sw_counters`. It does not use serverless filesystem state or require Blob for request budgeting.
- Preview analysis accepts the existing per-person `SITEWITNESS_USERS` bearer tokens used by `/api/archives`, with the same SHA-256 lookup and stable user IDs. The UI sends the typed token only in request headers. Local single-host analysis retains the separate shared access-code path.
- Request, decode, UTC global-day, per-user-day, and lifetime limits are stored in Postgres and reserved transactionally under the existing cross-instance row lock. Daily and lifetime reservations commit together. An upstream failure does not refund the allowance.
- The old SQLite `counters` rows are imported in full, including active minute/hour/day windows. Import requires a closed authoritative database containing `inference-lifetime`; missing history never defaults to zero. The importer hashes the source before and after reading and only raises existing Neon counts/expiry values (`GREATEST`). It records each imported row and source hash. It never deletes or lowers counters.
- Migration `010-neon-inference-budget.sql` creates only the import audit table. It does not initialize counters. The request path rejects an absent or unaudited lifetime counter. Vercel and `.env.example` inference settings remain off/zero.
- `INFERENCE_BUDGET_DRY_RUN=true` is a separate serverless acceptance mode. It requires the same bearer identity, image/question validation and Neon reservations, then returns a clear 503 without invoking the Meta adapter. It requires `INFERENCE_ENABLED=false`. Dry-run requests consume the configured user/global/lifetime allowances permanently; choose an explicitly accepted small budget. Both flags true is rejected.

## Required operator setup after review

1. Confirm the exact current closed SQLite authority and stop all writers. Do not use a stale backup as counter authority. Confirm the file contains the lifetime row; the importer will fail if it is absent.
2. Apply `009-neon.sql`, then `010-neon-inference-budget.sql` once to the intended Neon database. Keep `sw_lock` intact. Runtime DB role needs SELECT/INSERT/UPDATE on `sw_counters` and `sw_counter_imports`, and SELECT/UPDATE on `sw_lock` for row locking.
3. On an isolated trusted machine with the Neon pooled URL in the process environment, run `npm run inference:import-neon-reservations -- /absolute/path/to/closed/sitewitness.sqlite`. Review the printed source SHA-256 and imported aggregate counts. Do not rerun from a different/stale database to reduce counts; imports are monotonic.
4. Configure Preview-only `SITEWITNESS_STORAGE_PROVIDER=neon-blob`, `INSPECTION_STORAGE_ENABLED=true`, `DATABASE_URL`, exact `SITEWITNESS_PUBLIC_ORIGIN`, and `SITEWITNESS_USERS` with unique IDs and hashes of private random 32-byte tokens. The private Blob token and storage key remain necessary for archive storage, but not for inference budgeting. Keep Vercel Deployment Protection enabled for Preview and verify it blocks unapproved visitors.
5. For actual hosted backend acceptance, keep `INFERENCE_ENABLED=false` and the Meta key absent. Temporarily set `INFERENCE_BUDGET_DRY_RUN=true` and small nonzero user/global/lifetime request allowances that account for the permanent dry-run reservations. This exercises the `/api/analyze` storage path without a model call. Afterward return dry-run to false and retain inference disabled. Do not add a Preview Meta key until acceptance passes and the user separately authorizes potential paid calls.

## Hosted backend acceptance (synthetic only)

Run against the actual protected Preview and Neon database with `INFERENCE_BUDGET_DRY_RUN=true`, `INFERENCE_ENABLED=false`, no model key, and a small, explicitly accounted request allowance:

- Missing migration/import, malformed DB config, invalid user config, absent/wrong token, revoked token, foreign/missing Origin, cross-site fetch and unapproved Preview access fail closed with safe status/messages.
- Verify MIME, multipart, content-length/stream size, image signature/decode/pixel limit, blank/oversize question, duplicate form fields, and unsupported formats. Confirm none reaches the model adapter.
- Exercise reservation contention from independent serverless invocations: two requests sharing a user, different users competing for global daily allowance, lifetime exhaustion, and concurrent calls at exact boundary. Confirm persisted counts after cold start/redeploy and that an injected provider failure remains charged once.
- Confirm database disconnect/missing schema failures are 503 without returning credentials, SQL, provider URLs or raw errors. Check no automatic retry.
- Verify original SQLite counter values and imported rows against the reviewed source hash, then prove repeated import and newer/larger target values never decrease them.

The PGlite tests are useful deterministic coverage but do **not** establish Neon row-lock contention or Vercel cold-start behavior. Only after actual hosted acceptance, and separate explicit authorization for the model request/cost exposure, should a Preview-only Meta call be considered. Production stays disabled.

## Current blockers

The current execution context has no Vercel token, Neon pooled URL, configured Neon counter source path, Preview user-token list, storage key, or public origin. The authoritative SQLite store is not configured in this checkout. Managed-cloud network policy/status tooling is unavailable here. Therefore the lifetime counter has not been imported, hosted acceptance cannot run, Vercel Preview protection cannot be confirmed, and no Preview or environment changes were attempted.
