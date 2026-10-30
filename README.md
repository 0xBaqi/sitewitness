# SiteWitness v0.3 — pre-inference readiness

A browser-local construction-photo review workspace with a server-side Meta adapter. Synthetic browser and backend tests pass; real Meta access, billing, inference quality and deployment have NOT been verified. No SAM masks or spatial annotations are implemented.

## Local setup

Verified locally with Node.js 24.21.0.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Keep `INFERENCE_ENABLED=false`. The workspace can load existing browser-local reports without inference. Set `MODEL_API_KEY` and `SITEWITNESS_ACCESS_CODE` only in local/server environments, never `NEXT_PUBLIC_`. Enable inference only after explicit authorization for a controlled paid test; see the readiness guide before changing this flag.

## Verification without external inference

```bash
npx playwright install --with-deps chromium
npm run test:backend
npm run typecheck
npm run build
npm run test:browser
npm audit
git diff --check
```

Browser tests use fresh contexts on localhost:3107 and clearly labelled SYNTHETIC TEST DATA. Test routes block external and analysis requests; backend HTTP is stubbed only in tests. No fixture endpoint exists in the app. Generated screenshots/traces are ignored by Git.

## Implemented and verified locally

- JPEG/PNG/WebP upload validation, bounded request bodies, image decoding and metadata-stripped JPEG transmission preparation.
- Typed Meta adapter with bounded, schema-validated responses and safe timeout/error mapping; tested with deterministic stubs, not live inference.
- Finding selection, reviewer decisions, edited observations, notes, history switching and JSON export.
- Original photograph retention in real IndexedDB and restoration across refresh.
- Critical mobile/keyboard/loading/error and corrupt-history checks.

## Deployment status

Vercel configuration is prepared only; nothing has been deployed. Inference is disabled by default. Public production remains blocked on durable abuse/budget controls, per-user access, privacy/retention policy, and authorized real-photo evaluation. Process-local rate limits and a shared code are not sufficient public-production controls.

- [Production readiness and server environment variables](docs/production-readiness.md)
- [Verified browser/backend acceptance evidence](docs/browser-acceptance.md)
- [Real-photograph evaluation plan — no results yet](docs/evaluation-plan.md)

Observations are preliminary, never engineering certifications. Browser records and original image metadata can be sensitive; use only authorized images under an appropriate privacy policy. JSON export includes report/review data, not photograph bytes.
