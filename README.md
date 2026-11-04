# SiteWitness

SiteWitness is a public, no-login construction inspection workspace. Each inspection keeps site details, human observations, photographs, Meta Muse Spark 1.3 suggestions, review decisions, and its printable report together. The live Preview is [sitewitness-fhewd1vxi-0x-baqi.vercel.app](https://sitewitness-fhewd1vxi-0x-baqi.vercel.app/).

## Inspection workflow

1. Create an inspection and enter its site, location, title or question, human summary, observations, and notes.
2. Add up to five JPEG, PNG, or WebP photographs. Each file may be at most 4 MB; the combined upload for one analysis request is at most 4 MB.
3. Choose **Analyze with Meta Muse Spark** to send the selected photographs and relevant inspection context to the server. A fresh response is labeled as a Muse Spark suggestion and added alongside human observations in the same inspection.
4. Review each suggestion, edit its description, choose a decision, and add reviewer notes. Human observations remain separately labeled.
5. Save and reopen the inspection in this browser, then use **Print / save PDF** for a readable report. The report includes the photographs, source and timestamp of the AI analysis, photo hashes, findings, review decisions, and limitations.

The app does not analyze photographs until the user chooses Analyze. Analysis requires the live Preview service to be enabled and its server-side configuration to be healthy. The public Preview requires no login, account, access code, or bearer token. Abuse throttles and finite request allowances are enforced on the server; they are not a promise of unlimited availability. Meta credentials are never sent to the browser.

The optional **Previously generated Meta report** is a clearly labeled captured example, not a fresh result. It does not replace the new-inspection workflow and makes no additional model request.

## Local setup

Requirements: Node.js 24.x and npm. Install the pinned dependencies and start the app:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open the local URL printed by Next.js. A new local checkout supports manual inspections without an account or model key. Records and photographs are kept in the current browser's IndexedDB; they are not encrypted by SiteWitness and do not sync across browsers or devices. Export a JSON backup before clearing browser data.

To enable local live analysis, configure `.env.local` on the server only. Set `MODEL_API_KEY`, `SITEWITNESS_PUBLIC_ANALYSIS=true`, `INFERENCE_ENABLED=true`, `DATABASE_URL`, and the finite inference and automatic-throttle settings documented in [the environment template](.env.example) and [the live-inference operations guide](docs/vercel-live-inference-gate.md). Use the existing Neon database and apply its required migrations before enabling requests. Never use a `NEXT_PUBLIC_` variable for a credential. Do not enable dry-run and live inference together. A local manual-only setup should keep `SITEWITNESS_PUBLIC_ANALYSIS` and `INFERENCE_ENABLED` false.

## Verification

```bash
npm ci
npm run test:backend
npm run test:browser
npm run typecheck
npm run build
npm run test:smoke
npm audit
git diff --check
```

Playwright browser tests require the installed Chromium browser and its system libraries. Test fixtures are marked as synthetic or captured examples; tests that use injected inference responses do not make a Meta request. These checks do not certify construction safety or guarantee that the hosted inference service is available.

## Architecture

- **Next.js App Router** serves the unified inspection UI and same-origin `/api/analyze` route.
- **Meta Muse Spark 1.3** is called server-side. The route validates the question, site context, image types and sizes, limits one analysis to five photographs and 4 MB combined, and stores provenance with the response. No automatic model retry is performed.
- **Neon PostgreSQL** provides durable atomic inference reservations and abuse-control counters for the serverless Preview. The inference key and database URL remain server-side. Browser-local inspection records are separate from the inference-budget database.
- **IndexedDB** stores up to 25 saved inspections and their photographs in the browser profile, with revision checks against conflicting tabs. This is local persistence, not cloud backup or cross-device synchronization.
- **Print styles** produce a readable report through the browser's print dialog, where users can save as PDF. A separate JSON export is available as a backup.

## AI provenance and limitations

Fresh AI suggestions carry the `muse-spark-1.3` model identifier, generation time, the IDs and SHA-256 hashes of analyzed photographs, and a separate AI-finding list. Human observations, edits, and review decisions remain distinguishable in the saved inspection and report. A previously captured result is marked as an example/imported legacy result rather than fresh inference. Model output can be incomplete or wrong; reviewers must compare suggestions with the photographs and verify matters on site. Review decisions are self-declared and are not authenticated engineering sign-off.

SiteWitness does not perform SAM segmentation or provide masks, boxes, or pixel localization. A photograph cannot establish concealed, below-grade, measured, or compliance conditions. Reports are preliminary visual documentation, not engineering certification, a safety verdict, or a substitute for approved drawings and qualified professional inspection. Availability and request allowances for the public Preview can change as automatic abuse controls respond to traffic.

## Project records

The [captured-evidence audit](docs/captured-evidence-audit.md), [SAM feasibility assessment](docs/sam-feasibility.md), [Baronal Development Method V2](docs/baronal-v2.md), and [captured release-readiness report](docs/captured-release-readiness.md) describe earlier evidence and decisions. Documents named for v0.4, v0.5, v0.7, or earlier gate/readiness work are historical records, not descriptions of the current first-run experience or a guarantee of current deployment state.
