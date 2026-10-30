# Pre-inference readiness — 2026-10-30

This is a local hardening checkpoint, not approval for public production or evidence of real inference quality. No deployment, paid request, SAM integration or billing change was performed.

## Backend boundaries

The route delegates to `lib/server/analyze.ts`; `lib/server/meta.ts` owns the typed inference adapter. Tests inject HTTP implementations in test code only. No fixture route or runtime test switch exists.

Uploads are bounded to 4 MiB plus 64 KiB multipart overhead while streaming, even with missing/false content-length. Body reads have a 10-second deadline. Exactly one photo and string question are required; unknown/duplicate fields are rejected. Questions must be nonblank and at most 500 characters. Sharp fully decodes JPEG/PNG/WebP, rejects format mismatch, animation and more than 24 million pixels, auto-orients, strips metadata and re-encodes JPEG before sending. The normalized output must also fit 4 MiB. Browser retention keeps the original photograph, including any original metadata; transmitted bytes differ. CPU-heavy image decoding remains a resource consideration.

Credentials stay server-side; authentication uses fixed-size digest comparison. Same-origin browser requests are enforced when Origin is supplied; cross-site fetch metadata is rejected. These checks supplement authentication, not replace it. Responses are no-store and nosniff. Upstream error bodies, keys and codes are never returned or logged. Image text and questions are untrusted; model content is schema checked, escaped by React, never executed as HTML. Finding IDs must be nonempty, nonreserved and unique. A fixed professional-review notice replaces the model's notice.

The adapter has a fixed HTTPS destination, refuses redirects, caps response bytes at 128 KiB and aborts after 45 seconds including body consumption. Malformed, incomplete, refusal-only, missing or invalid outputs fail closed. Network and model parsing failures return safe 502 errors, timeouts 504, upstream limits 429 with a conservative Retry-After. No automatic retries incur duplicate inference charges.

Local limits: 60 authenticated/unauthenticated attempts per minute after origin/config checks; 10 authenticated image-processing attempts per hour. Buckets are global per warm process and do not trust spoofable forwarding headers. Invalid image decoding consumes hourly budget. Counters reset on restart and multiply across serverless instances. This is NOT durable account-based abuse prevention; public deployment requires a shared limiter/budget control and proper per-user authentication. A shared code can cause cross-user denial of service and is only appropriate for a controlled trial.

## Vercel preparation (not deployed)

`vercel.json` selects Next.js and installs basic no-framing, no-sniff, no-referrer and permissions headers. The Node route exports maxDuration=60. No plan, region, paid service or infrastructure was changed. Confirm the selected account/plan supports this duration before deployment.

Server-only environment variables (never NEXT_PUBLIC):

| Variable | Requirement |
| --- | --- |
| MODEL_API_KEY | Valid authorized Meta credential; configure as an encrypted deployment environment variable. |
| SITEWITNESS_ACCESS_CODE | Unique, high-entropy trial code, preferably 32 random bytes; never commit or embed in a URL. |
| INFERENCE_ENABLED | Defaults to disabled; exact `true` permits requests only after explicit operator authorization and billing/access verification. Keep previews disabled. |

Keep `.env.local` local and ignored. `.vercelignore` excludes .env files, tests, test results, Playwright configuration and docs from upload; set secrets in Vercel independently. Tests are dev-only dependencies and no production module imports fixtures. The deployment configuration does not create secret values or enable inference.

Vercel documents a 4.5 MB function request/response limit; the application's multipart cap is below that, but platform-level failures can still be non-JSON. The UI now handles unreadable errors and times out after 55 seconds. References: https://vercel.com/docs/functions/limitations and https://vercel.com/docs/functions/configuring-functions/duration . Reconfirm platform and account limits before an approved deployment.

Do not publicly deploy until shared rate limiting/budget enforcement, user access policy, privacy/retention requirements and real-model evaluation are resolved. Meta endpoint/model compatibility remains inherited and unverified; do not treat HTTP stubs as evidence of service availability.

## UI audit and remaining limits

The existing layout is retained. Critical fixes add validated history restoration, a client timeout, safe non-JSON errors, a visible no-findings state, busy semantics, disabled request fields, keyboard focus outlines, long-text wrapping and protection against displaying the previous report's photo under a new report. Browser coverage includes a 375px viewport, keyboard finding selection, corrupt history recovery and loading/error transitions. This is not a complete WCAG or cross-browser audit.

Browser records remain origin/profile/device local and unencrypted at application level. Original photo metadata is retained locally. No user deletion/retention policy, multi-tab conflict handling, durable report storage, image cleanup at the history cap, or persistence quota recovery is implemented. CSP enforcement still requires a nonce-compatible design; no unsafe broad CSP was added. Load/abuse tests, accessibility assistive-technology testing and deployment smoke tests remain outstanding.


## Local security review evidence

No secret environment file is tracked; only `.env.example` appears in Git's environment-file history. Exact-match scans of configured local credential values found no matches in tracked files or reachable Git history; values were never printed. Production source contained no fixture imports. A scan of 34 generated production JavaScript files found no synthetic fixture markers or configured credential values. This is a scoped exact-value/import/artifact review, not a general-purpose or exhaustive secret-history audit. Test fixtures remain in development tests only and are excluded from Vercel uploads.

Verification: 31 backend tests and 4 browser tests passed; production build, typecheck, npm audit (0 vulnerabilities) and git diff --check passed. No cloud configuration was applied and inference remains opt-in.
