# SiteWitness v0.5 — manual inspection workspace

Create an inspection, add photographs, write human observations, record notes and review decisions, save, reopen, and export. AI analysis is unavailable and locked off; manual observations are never represented as AI findings.

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

Browser tests require an installed Playwright Chromium browser and its system libraries. All fixtures are clearly labeled synthetic. Browser traffic to external hosts/analysis is blocked; backend HTTP uses injected stubs. Tests do not establish real model availability or quality.

## Persistence and provenance

- Manual records and photographs save atomically in a separate IndexedDB database, with revision conflict checks, visible save failures, a 25-record cap, and explicit deletion.
- Human-authored, AI-generated, and legacy/unknown provenance are distinct in types, storage, UI, and exports. Unlabeled old records remain unverified; their existing review and photo-restoration workflow is preserved.
- The encrypted per-user SQLite API remains optional and local-host-only. Manual writes require manual provenance; clients cannot claim AI generation. Browser history does not sync with the API, and server photograph storage is not implemented.
- Vercel preview configuration keeps both backend persistence and AI disabled. A preview can offer browser-local manual inspection, not authenticated cloud storage.

[v0.5 workflow, architecture assessment, and production blockers](docs/v0.5-readiness.md) · [Historical v0.4 controls](docs/v0.4-readiness.md) · [Evaluation plan](docs/evaluation-plan.md)

No SAM masks, live model results, deployment, or cross-device sync are claimed. Human observations and review decisions are not engineering certifications.
