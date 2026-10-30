# SiteWitness — first working vertical slice

A **real Meta Muse Spark image-analysis workflow**. Not yet a complete production app or hackathon submission. SAM 3.1 segmentation, image-linked overlays, authenticated accounts, shared persistence, and engineering validation are NOT implemented. Never claim otherwise.

## Start locally (Node.js 20.17+)

```bash
npm install
cp .env.example .env.local
# Edit .env.local: MODEL_API_KEY and SITEWITNESS_ACCESS_CODE
npm run dev
```

Open http://localhost:3000 and enter your access code in the inspection form.

## Deploy

Push this project to your own private GitHub repository, then import into Vercel. Set `MODEL_API_KEY` and `SITEWITNESS_ACCESS_CODE` as **server-side** environment variables (do not use `NEXT_PUBLIC_`). Never commit `.env.local`. Do not expose this alpha publicly to strangers: access code is shared, the rate limit is process-local and not reliable on serverless, and the app has no user identity or durable server-side database.

## What works
- Real image upload (JPEG/PNG/WebP, <=4MB) to server-side route
- Real Muse Spark 1.3 analysis using Meta Responses API
- Structured validation of returned report
- Human accept/reject/investigate review controls
- Browser-local history and JSON export; photos are NOT saved
- Server-side API key, origin check, basic request cap, size/type/signature checks, request timeout, errors

## Next milestones, in order
1. Obtain API key and run five diverse real construction photos; score factual claims.
2. Add SAM 3.1 using official `@meta-sam/parser`, verify actual masks/boxes; map claims to segments only when they truly match.
3. Replace browser-only storage with authenticated server-side DB, object storage, deletion/retention policies.
4. Distributed rate limiting, per-user quotas, image resizing and cost caps, observability and security review.
5. Test production deployment end-to-end; demo must show real inference.

## Documentation
- https://dev.meta.ai/docs/quickstart
- https://dev.meta.ai/docs/image-understanding
- https://dev.meta.ai/docs/sam/overview
- https://dev.meta.ai/docs/sam/client-libraries

### Safety
The outputs are preliminary visual observations, never compliance findings, structural safety certifications, or professional engineering opinions. Metadata/history saved on browser may contain sensitive text. Do not upload confidential construction photos without rights and appropriate vendor privacy review.
