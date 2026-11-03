# SiteWitness — captured Evidence Trace release evidence

Date: 3 November 2026 (Africa/Lagos). Base commit: `1b5012d`. Actual checkout: `/home/baronal/projects/sitewitness/sitewitness-starter`.

## Result and boundary

The actual Next.js application now links to `/evidence`: select the exact original/prepared photograph or open the built-in sample → see the genuine captured Muse report → review/edit/accept/reject/investigate → save/reopen → export with photograph. No new analyze request is performed. This is explicitly a captured result, not fresh inference for arbitrary uploads. The implementation is ready for local demonstration, subject to the verification recorded below; it has not been deployed or hosted-tested in this session.

Original Muse output, the AI-assisted visual audit and human review are distinct in UI and exported JSON. All four findings and three questions were audited against the actual photograph before coding. Some detail needs qualification (platforms, universal helmet use, precise headcount and concrete continuity); no construction defect or safety verdict is established. See `captured-evidence-audit.md`.

## Implemented

- Source preparation exactly matches the prior inference image SHA-256 and 108,142-byte size. Original and prepared image fingerprints are recognized; unrelated uploads fail with an actionable manual-workflow alternative.
- Genuine immutable source report and safe usage metadata are checked in. No provider reasoning text, raw response envelope, credentials or private authorization files were copied.
- Four independent human decisions, description edits, notes, reviewer name and three follow-up answers. Reviewer identity is explicitly self-declared. No automatic acceptance or professional sign-off.
- Separate IndexedDB database saves review and exact photograph atomically; revision checks prevent stale-tab overwrites. Explicit save failures retain an exportable draft; saved records can be reopened or deleted.
- Complete JSON export includes original AI report, audit, human review, source photo, image hash, usage, billing uncertainty, absent localization and unsaved-draft status. Export is a portable record, not an import/restore feature or signed certificate.
- Manual inspection, legacy review, vault schemas, authorization and server storage implementation are unchanged.

## Verified locally

- All 74 backend tests passed: schema/error handling, authentication, cross-origin rejection, owner isolation, provenance-forgery rejection, encrypted storage/recovery, quotas and durable inference locks.
- Production build and typecheck passed; `/evidence` is included in the build.
- Existing 13 browser tests passed. All 3 new captured-result tests passed after correcting test selectors (textbox accessible-role lookup and app-scoped errors rather than Next's separate route-announcer alert). No product behavior or assertions were weakened.
- Captured browser tests verify selection, unchanged exported AI content, separate human edits/answers, exact exported photograph hash, save/reload/reopen/delete, responsive width, corrupt/unrelated image rejection, save failure and stale-tab conflict. External/API requests are blocked; the happy path asserts no API request was attempted.
- Authenticated local vault browser test passed: real local HTTP snapshot upload, owner separation, photograph restore and deletion using synthetic accounts/data.
- `npm audit --json`: zero vulnerabilities (115 dependency entries). No dependency or lockfile change.
- Gitleaks scans of the new page and captured payload found no leaks. A boolean-only check of 23 browser/public assets found no occurrence of the locally loaded model key.
- Both request-lock hashes are unchanged: first `f2f3a719824027e480b1d2cba9bdb5d102c2ad1b3f2ed256e8e2441d8e7b754a`; second `d1061f8523e8d6de49e171cafbdb5ec11629789fe0d6a2f9a685c981575ab417`.

Restart and final visual/security check outcomes are recorded in the final verification addendum below. Automated tests do not constitute independent professional construction review.

## Judge walkthrough

1. Open the app and select **Review captured AI report**, then **Open captured sample**. The page states that this is the real result captured on 3 November, with no new inference.
2. Inspect the photograph and original AI description/evidence/limitation. Read the separately labeled audit qualification. Open capture provenance for model, latency, token usage, estimated cost and hash.
3. Edit an observation and choose **Requires further investigation**, **Accepted as observation** or **Rejected / unsupported**. Add notes and answers; none alter the original AI report.
4. Save the review, reload the page, and reopen it. Export and inspect separate `originalAI`, `assistantAudit`, `humanReview` and `photograph` sections.
5. Use manual inspections for another photo. Do not imply a new AI analysis happened or describe the record as an engineering certification.

## Exact release gates and blockers

**Protected preview candidate:** code is integrated into the existing deployable app; no new infrastructure or model credential is required for the captured journey. The sample/report become accessible to anyone who can access that deployment, so retain hosting-level preview protection. No deployment, push, production promotion or public inference enablement occurred here. The previous hosted preview does not contain this local commit until explicitly deployed.

**Hosted verification remains outstanding:** deploy the exact verified commit to the intended protected Preview (not Production), then verify access protection and the judge journey there, including reload, photo retrieval and export on the intended browser/device. Local success is not hosted evidence. Current remote configuration and the exact Preview origin were not reverified in this session.

**AI report cloud persistence is not implemented:** captured reviews are browser-local; the private server vault continues to accept manual archives only. The new export is intentionally not mislabeled as a manual archive. Cross-device authenticated AI save/restore requires a separately designed trusted ingestion path, provenance binding, archive/schema support and hosted ownership/durability tests. Do not weaken manual-only server validation to make it appear supported.

**General live inference remains disabled:** the public route and both one-shot locks are unchanged. New photographs do not receive AI reports. Any additional Muse request needs separate authorization and a reviewed request gate. Account billing/credit application remains unverified; $0.007779 is the historical usage estimate, not a charge confirmation.

**SAM is documentation-only:** official API/schema and localization requirements are recorded in `sam-feasibility.md`. There is no SAM caller, decoder or live-tested overlay. Do not add fabricated geometry. A real experiment requires separate authorization; integration also needs bounded parsing, exact-image alignment and human confirmation of finding/object links.

This is a focused captured-result review workflow, not a claim that the full live/cloud product is launch-ready.

## Final verification addendum

The standard restart smoke test timed out twice without assertion changes: first on request 1 (GET after first start), then on request 6 (DELETE after second start). A temporary diagnostic copy with the same assertions and timeouts, local-only storage configuration and status/timing logging passed all restart, isolation, revocation, deletion and expiry checks in 26.65 seconds. That diagnostic copy was removed; the original test is unchanged. The exact timeout cause is not established. This intermittent test behavior remains a release-reliability issue to investigate before claiming dependable hosted/server persistence; the successful diagnostic run does not erase the failures.

The three captured-workflow tests and all thirteen existing browser tests passed across the recorded runs, and the separate authenticated vault browser check passed. Final typecheck passed. No new application code changed after the successful production build. The new captured workflow uses browser-local persistence and does not depend on the server archive route implicated in the restart smoke timeout.
