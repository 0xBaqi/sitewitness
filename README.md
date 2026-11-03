# SiteWitness — captured Evidence Trace and manual inspections

Open **Evidence Trace** at `/evidence` to review the genuine captured Muse Spark 1.3 result from 3 November 2026. Choose the built-in sample or select the exact original/prepared photograph, inspect four observations and three questions, record separate human edits/decisions/answers, save/reopen with the photograph in this browser, and export the complete record. Every screen identifies this as a captured result with no new inference. Other photographs remain manual-only.

The original AI report is unchanged. An AI-assisted audit is labeled separately from human review. All human decisions begin unreviewed; reviewer identity is self-declared, and exports are preliminary, not signed engineering reports. No SAM localization exists. The captured review has a separate browser database and cannot be uploaded to the manual-only private vault. Browser-profile access is not authentication; clearing browser data loses saved reviews. Export a backup.

See [visual evidence audit](docs/captured-evidence-audit.md), [SAM documentation investigation](docs/sam-feasibility.md), [Baronal V2](docs/baronal-v2.md), and [release evidence](docs/captured-release-readiness.md).

Manual inspection remains available: create an inspection, add photographs, write human observations, record notes and decisions, save, reopen, and export. Public live analysis remains locked off; manual observations are never represented as AI findings.

## Run locally

Use Node.js 24.x (verified runtime: 24.21.0).

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open the local URL shown by Next.js. Choose **New manual inspection**. No account, access code, or model key is needed for browser-local manual work. Save explicitly; exports include the current draft and original photographs. Anyone with access to the same browser profile can access saved records. Browser data is not encrypted by this application and is not cloud backup.

Keep `INFERENCE_ENABLED=false`, `INFERENCE_CALL_LIMIT=0`, and server storage disabled unless deliberately configuring the optional local API. Environment flags cannot unlock the live inference handler. No Meta request, paid service, push, or deployment is authorized by this README.

## Verification

```bash
npm run test:backend
npm run typecheck
npm run build
npm run test:browser
npm audit
git diff --check
```

Browser tests require an installed Playwright Chromium browser and its system libraries. Synthetic fixtures and synthetic reviewer inputs are explicitly labeled; the captured workflow test uses the genuine saved report and photograph. Browser traffic to external hosts/analysis is blocked; backend HTTP uses injected stubs. Tests do not establish real model availability or quality.

## Persistence and provenance

- Manual records and photographs save atomically in a separate IndexedDB database, with revision conflict checks, visible save failures, a 25-record cap, and explicit deletion.
- Human-authored, AI-generated, and legacy/unknown provenance are distinct in types, storage, UI, and exports. Unlabeled old records remain unverified; their existing review and photo-restoration workflow is preserved.
- The encrypted per-user SQLite API remains optional and local-host-only. Manual writes require manual provenance; clients cannot claim AI generation. Browser history does not sync with the API, and server photograph storage is not implemented.
- Vercel preview configuration keeps both backend persistence and AI disabled. A preview can offer browser-local manual inspection, not authenticated cloud storage.

[v0.5 workflow, architecture assessment, and production blockers](docs/v0.5-readiness.md) · [Historical v0.4 controls](docs/v0.4-readiness.md) · [Evaluation plan](docs/evaluation-plan.md)

One genuine captured Muse result is available for the exact sample photograph. No SAM masks, general live inference, deployment of this change, or cross-device sync for captured reviews are claimed. Human observations and review decisions are not engineering certifications.

## Deployment readiness (v0.7)

See [the single-host deployment runbook](docs/v0.7-deployment-runbook.md) and reviewed templates in `deploy/`. Nothing is deployed by these files. Run `npm run test:smoke` after building to verify production restart/storage behavior locally. `npm run storage:expire` purges expired snapshots; a five-minute systemd timer template is included. HTTPS, host verification, off-site backup/deletion reconciliation and operator recovery remain launch gates.
