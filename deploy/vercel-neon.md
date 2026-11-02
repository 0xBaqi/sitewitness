# SiteWitness v0.9 — free-hosting migration

Prepared 2 November 2026 (Africa/Lagos). Base verified clean: `9077629a75c293088b4af0a7f5acb2ffd67af1ba` in `/home/baronal/projects/sitewitness/sitewitness-starter`.

## Decision

**GO for local implementation review; NO-GO for claiming a verified hosted durable service.** No provider resources were created, no money spent, no push or deployment performed. A hosted judge URL does not yet exist from this work. Before deployment, resolve Hobby eligibility, provision only free services, run the live provider acceptance checks below, and obtain deployment authorization.

The manual inspection workflow remains usable locally: create, photograph, record observations/review notes, save, reopen, and export. Existing local SQLite snapshots remain supported. Remote archives now use bounded metadata and separate binary photos. There is no framework rewrite.

**Deadline priority:** after the listed hosting gates, stop infrastructure work once judges can open the HTTPS manual workflow and restore a synthetic snapshot. Real Meta integration is still absent and is an urgent separate milestone. The analyze route's code gate is unchanged, inference is false, the call limit is zero, and no Meta request was made. Never describe human-authored observations as AI output. If time runs out, publish only the honestly labelled browser-local manual preview after authorization and Hobby eligibility confirmation.

## Implementation

- `SITEWITNESS_STORAGE_PROVIDER=neon-blob` selects the remote `/api/archives` adapter. The original local adapter remains for existing local installations. The older metadata-only `/api/inspections` endpoint remains local-only and fails closed on Vercel; the vault uses `/api/archives`.
- PostgreSQL stores encrypted metadata, photo manifests, pending reservations, rate counters and deletion state. A durable row lock protects atomic global/per-owner quotas and serializes upload/deletion races across app instances. Per-request pooled connections are released and closed; no durable state lives in a serverless filesystem or process counter.
- The versioned AES-256-GCM envelope binds owner, snapshot ID, expiry and photo ID (or metadata marker). Fresh IVs are generated for every encrypted write. Metadata fingerprints use HMAC. This is application encryption, not end-to-end encryption; the application operator controls the key. Owner IDs, timestamps, opaque object paths and allocated sizes remain database metadata.
- Private Blob objects contain ciphertext only. Object names and provider credentials never reach the browser. Authenticated photo responses are `private, no-store`, with authorization variance; object reads bypass the provider cache. Photos are bounded to 4 MiB binary, metadata to 64 KiB, and listing to ten metadata records per page.
- Bearer-token hashing, revocation via user configuration, origin checks, Sharp full decode/24-megapixel limit, manual-only provenance, privacy headers, seven-day read-time expiry and conservative 128/40 MiB plus 1000/100 record quotas are preserved. Pending allocations count against quotas. The global 60-request/minute protection also applies to photo requests.
- Upload protocol: reserve a UUID and immutable metadata; upload each photo; finalize only when all are validated and stored. Reusing a matching operation UUID is idempotent. Object paths are committed before uploading, allowing cleanup after ambiguous provider failures. Finalized photos cannot change. The UI cancels failed uploads with a delete request; interrupted requests expire from pending after one hour.
- Delete hides the snapshot and clears encrypted metadata immediately, then queues ciphertext deletion. Cleanup retains opaque tombstones/paths until original expiry plus one day, covering uncertain in-flight writes. Deleted entries continue consuming the record-count quota during this period; byte reservations are released only after successful object deletion.
- The daily authenticated cleanup job handles pending abandonment, expiry and deletion in batches, with a time budget and backlog reporting. Logical expiry does not depend on cron. Physical deletion can lag by a daily scheduling interval and longer during outages/backlogs. Provider backups and browser exports have separate retention. This does **not** reproduce the previous five-minute physical cleanup timer; if that is mandatory, this hosting configuration is NO-GO.

## Provider setup (not performed)

1. Confirm this entry's actual personal/noncommercial use qualifies for Vercel Hobby, including prize/commercial intent. Do not assume every hackathon qualifies. Use Hobby only, Neon Free only, and a private Blob store. Decline paid upgrades, paid domains, add-ons, or card/billing requirements incompatible with the $0 constraint.
2. Create the Neon Free database and a **private** Vercel Blob store after authorization. Select nearby regions. Use the Neon pooled URL with a `-pooler.` hostname ending in `.neon.tech`. The adapter enforces verified TLS. Do not use a public Blob store.
3. Apply `deploy/migrations/009-neon.sql` once using a migration connection/role before enabling storage. Keep the migration role separate where practical. A runtime role needs SELECT/INSERT/UPDATE/DELETE on snapshots, photos and counters, and SELECT/UPDATE on `sw_lock` (row locking requires UPDATE permission). No per-request DDL runs. Keep the lock row intact.
4. Configure server-only `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, a new 32-byte hexadecimal `SITEWITNESS_STORAGE_KEY`, `SITEWITNESS_USERS` with unique stable IDs and SHA-256 hashes of random 32-byte base64url bearer tokens, exact HTTPS `SITEWITNESS_PUBLIC_ORIGIN` without trailing slash, and random `CRON_SECRET` of at least 32 characters. Do not use `NEXT_PUBLIC_` variables. Keep keys separately backed up and distribute individual judge tokens privately.
5. Set `SITEWITNESS_STORAGE_PROVIDER=neon-blob` and `INSPECTION_STORAGE_ENABLED=true` only for the configured environment. With the enable flag absent, storage stays off. `vercel.json` deliberately keeps inference false and zero calls; its daily cron is `03:00 UTC` (04:00 Lagos, subject to Hobby scheduling precision). Confirm cron runs in the intended production deployment; preview deployments are not a retention solution.
6. Use a fresh synthetic judge dataset. SQLite and recovery scripts are untouched; no private existing data was copied. There is no automatic SQLite-to-Postgres importer. Users can explicitly export and upload an archive as a **new** seven-day snapshot; that is not an expiry-preserving historical migration. Retain the old service until any separately requested data migration is validated.
7. Do not connect a Git integration that would publish automatically before deployment is authorized. Use the included Vercel hostname once publishing is approved. Confirm the judge URL opens without the owner's Vercel login and that platform protection does not obstruct judges. Each judge needs their own snapshot token; the manual local workflow itself has no server account requirement.

## Mandatory hosted acceptance gate

Use synthetic records only. Do not declare GO based on a local build or mocked tests.

- Apply migration; verify clean failures for missing schema/credentials and confirm the Blob store is private via an unauthenticated object request.
- Run concurrent reservations from separate function instances against actual PostgreSQL, including both count and byte limits. Local PGlite tests execute PostgreSQL queries but serialize transactions and cannot establish deployed lock contention behavior.
- Upload five photos including a valid 4 MiB boundary image, reject a larger body, list multiple pages, restore photos, and verify the report/provenance/reviews. Reload and redeploy to prove durability. Observe real cold-start and request duration limits.
- Attempt cross-owner reads, photo reads, deletes and uploads; revoke a token and repeat. Confirm private responses and errors contain no provider URLs or secrets. Test an unauthenticated judge browser.
- Interrupt an upload between Blob write and database update. Verify no incomplete snapshot is listed, pending expiry works, and cleanup removes the referenced object. Simulate deletion failure, ensure reads remain denied, and retry cleanup. Inspect cron response/logs: a nonzero backlog returns 503 and requires an operator retry; Vercel does not promise automatic retry.
- Test the exact seven-day logical boundary and scheduled physical removal. Monitor provider quota usage, especially operation/transfer limits; application byte quotas are not monthly provider-operation caps. Stop use if free allowance is exhausted; do not upgrade.
- Verify `/api/analyze` still rejects without contacting Meta and manual UI clearly identifies human-authored work.

Until these pass, deployment of durable storage is **NO-GO**. No live-provider credentials were requested or used in this implementation session.

## Recovery and operational limits

Use current authoritative deletion/expiry state when restoring provider backups. Never roll back the database and expose restored snapshots from stale backups; that could resurrect deleted records. If current deletion authority is lost, discard restored snapshots and their object namespace and start an empty synthetic dataset. Keep old local recovery operations separate from PostgreSQL; the SQLite recovery script is not a remote recovery tool. Encryption key loss makes remote snapshots unrecoverable; token revocation is independent of key rotation.

The global transactional lock intentionally favors correctness and a tiny pilot over throughput; object I/O briefly holds it. Lock contention or provider timeouts can yield 503 and require retry. The 60-attempt global limit can affect a busy judge session. Cleanup failures/backlogs require operator attention. Failed uploads and retained tombstones can temporarily exhaust the conservative record cap. No availability, strict physical-purge SLA, automatic provider backup reconciliation, or live cloud recovery test is claimed.

## Provider evidence

Official documentation checked on 2 November 2026:

- [Vercel Hobby](https://vercel.com/docs/plans/hobby): free personal/noncommercial plan; quota and eligibility constraints apply.
- [Private Blob storage](https://vercel.com/docs/vercel-blob/private-storage) and [SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk): authenticated private objects and server-side get/put/delete. SDK pinned to 2.4.0 after the latest release introduced an audited vulnerable transitive dependency.
- [Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing): free allowances are finite. Remain on Hobby; check actual account usage before judging.
- [Neon pricing](https://neon.com/pricing): Free is $0 with no credit card required; includes 1 GB Postgres, 100 CU-hours monthly per project and advertises 5 GB object storage. Onboarding was not exercised.
- [Neon application connections](https://neon.com/docs/connect/connect-from-any-app): PostgreSQL connectivity; use pooled connections and verified TLS.
- [Hobby cron constraints](https://vercel.com/docs/cron-jobs/usage-and-pricing): daily scheduling, with timing limitations.
- [Neon object storage announcement](https://neon.com/blog/building-neon-object-storage): describes S3 compatibility and private visibility. A compatible end-to-end private object lifecycle was not verified here, so it was not substituted for Blob. No second adapter was added under the deadline.
