# SiteWitness v0.9 verification

Date: 2 November 2026, Africa/Lagos.

Repository: `/home/baronal/projects/sitewitness/sitewitness-starter` (Ubuntu-24.04).
Starting HEAD: `9077629a75c293088b4af0a7f5acb2ffd67af1ba`, verified clean before implementation.
Runtime: Node 24.21.0; Next.js 15.5.28.

## Completed checks

| Check | Result | Scope |
|---|---|---|
| Backend suite | **65 passed, 0 failed** | Existing 54 plus 11 remote-storage/security tests |
| Browser suite | **13 passed** | Manual inspections, photographs, review state, export, mobile and split-photo transport |
| Local vault browser test | **1 passed** | Real local API: authentication, owner separation, upload, restore and delete |
| Production restart smoke | **1 passed** | Local persistence across restart, revocation, deletion and idle expiry |
| TypeScript | **Passed** | Final source and tests |
| Production build | **Passed** | Build ID `ekj4puOtMoBPw6WQv2Dk7`; includes remote archive and cleanup routes |
| Credential-pattern scan | **Passed** | 15 application/configuration/test/runbook files at scan time; no secret values printed |
| Inference gate | **Unchanged and disabled** | Existing locked route, false enable flag and zero call limit; backend and browser coverage |
| Whitespace/diff check | **Passed** | Final staged changes checked before commit |

New backend tests execute the migration and SQL against local PGlite PostgreSQL with an in-memory object-store substitute. They cover encryption/tampering/context binding, owner separation, retries/idempotency, incomplete uploads, ambiguous object-write failures, cleanup failures/retries, seven-day expiry, one-hour abandonment, quota reservations, pagination, revocation, bounded uploads, exact 4 MiB valid-image handling, forged images/provenance, cleanup authorization and missing migration-lock rejection.

The new browser split-transport test intercepts API responses to verify client binary upload, metadata-only listing, photograph download, restore and delete. It is **not** a real Neon/Blob browser integration test. The separate existing vault test and restart smoke use the real **local SQLite** path.

## Dependency audit

Installing the latest Blob SDK initially reported four high-severity findings, all stemming from a vulnerable transitive Zod dependency through its authentication helper. The SDK was pinned to **@vercel/blob 2.4.0**, which supports private storage and avoids that chain. The resulting `npm install` audit reported **0 vulnerabilities** for the final dependency set.

Later standalone `npm audit` attempts, including a retry with a longer timeout, failed because the npm advisory endpoint was unavailable. They did not produce a new vulnerability result. **The final standalone audit is inconclusive due to network errors; do not describe it as a fresh clean audit.** Re-run it before deployment. No forced broad dependency upgrade was used.

## Test-harness issue resolved

An earlier combined backend run crashed inside Node/V8 WebAssembly while repeatedly creating and destroying the PGlite engine. The test harness now reuses one engine and truncates fixture tables between tests, then closes it once. Subsequent full runs passed, including the final 65-test run. This was a failed earlier verification attempt, not omitted from the record.

## Deployment gate and honest limits

**NO-GO for declaring a hosted durable service ready.** No live Neon connection, real private Blob upload/read/delete, independent PostgreSQL-server lock contention, Vercel-hosted execution, redeploy durability, hosted cron, or judge URL acceptance was tested. PGlite serializes local transactions and cannot establish deployed multi-instance concurrency behavior. No remote backup/restore was performed.

Seven-day logical access expiry is enforced independently of cleanup. Physical ciphertext deletion uses a daily job and can lag further during outages or backlog; this does not preserve the old five-minute physical purge cadence. Pending/deleted records retain conservative quota reservations or tombstones as described in the runbook. Existing SQLite data was not copied or migrated automatically.

Before publishing: confirm Hobby eligibility and free-only account setup; apply the migration; configure server-only credentials; complete the live-provider checks and a successful advisory audit; confirm the judge URL works without the owner's login; obtain deployment authorization. See `deploy/vercel-neon.md` in the repository or the accompanying setup runbook.

No spending, account provisioning, push, deployment, or Meta API call occurred. Real Meta integration remains disabled and is the urgent next product milestone after a usable judge workflow is authorized and verified.
