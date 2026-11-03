# SiteWitness: one authorized image request

The previously confirmed $150 Meta promotional balance is accepted. Repeated credit verification is not a prerequisite. No live request has been sent. Explicit acceptance of the remaining linked-card risk is still required.

## Verified checkpoint — 3 November 2026

All 71 backend tests, typecheck and production build passed for these changes. The selected photograph was prepared offline: 108,142 JPEG bytes; SHA-256 `a2f25a2177b635c9ede4ad4882275e9611b3261a8d8c56295d18effc9396a85a`. No Meta request, retry, SAM call or deployment was performed. Existing browser/vault/restart checks passed at the preceding checkpoint; they were not rerun for these CLI-only authorization changes. No dependencies changed.

## Implemented controls

- The operator CLI requires explicit one-request authorization, explicit linked-card risk acceptance, and a non-sensitive-image confirmation. Approval is bound to the SHA-256 of the exact prepared image. There is no recurring credit attestation or short expiry that forces reapproval during this session.
- A fixed reservation file in the checkout's sibling `.sitewitness-validation` directory is created exclusively and synced before calling Meta. Concurrent starts and later reruns fail. The output-directory environment variable can no longer move or bypass this reservation.
- The reservation remains after success, rejection, network error, invalid response or timeout. There is no reset/retry command. Any later call, including SAM, requires separate explicit user authorization and an operator-reviewed change; none is automatically scheduled.
- One image only, maximum 4 MiB source and 24 megapixels. It is decoded, metadata-stripped, oriented, and resized to fit 1024 × 1024, with the prepared JPEG limited to 1 MiB before inference.
- One HTTP generation request to `muse-spark-1.3`, with at most 1,800 output tokens. No SDK retries, redirects, tools, web search, background execution, contributor mode or follow-up model calls.
- A 45-second client timeout and 128 KiB response bound remain. A timeout does not guarantee the provider stopped computing or billing.
- Public `/api/analyze` remains locked in code; environment flags cannot enable it. The local key stays in owner-only, Git-ignored `.env.local`, and is never printed.
- The private result records image hash, actual returned model and token usage when available, latency and schema-validated observations. Missing evidence is not treated as a verified result.

## Conservative cost estimate and residual risk

Standard pricing checked on 2 November 2026: $1.25 per million input tokens and $4.25 per million output tokens. For planning, use the full advertised one-million-token context as uncached input, plus all 1,800 output tokens: $1.25765, rounded up to **$1.26**. This deliberately overestimates the expected size of this single small-image request. It is not an enforceable provider or card cap and excludes any applicable tax or currency-conversion fees.

The app can bound its own requests, but cannot force Meta to apply promotional credits or control other clients sharing the account. If credits are unavailable, expired, exhausted by other usage, or not applied to the account/request associated with this key, usage may become payable on the linked card. Meta can collect accrued charges at its payment threshold or monthly billing date. An interrupted or failed local request may still have incurred provider usage. Pricing/billing discrepancies cannot be prevented by the local reservation.

Therefore, explicitly approve the one-image request and this residual card-charge risk before execution. Until then, leave both `oneRequestAuthorized` and `linkedCardRiskAccepted` false. The approval is only for this Muse Spark request; it does not authorize SAM, retries or subsequent images.

## Operator procedure

1. Run `node --import tsx scripts/validate-meta.ts --prepare IMAGE` from the checkout. This only prepares the image hash and estimate locally; it sends no network requests and needs no key.
2. After the human explicitly approves the residual risk, record `authorizedAt`, `oneRequestAuthorized:true`, `linkedCardRiskAccepted:true`, `nonSensitiveImageConfirmed:true` and the exact `imageSha256` in the private approval JSON. Never mark these true speculatively.
3. Load the existing secret directly with Node's `--env-file=.env.local` and run the operator CLI once with `--execute IMAGE APPROVAL_JSON`. Do not include the secret itself in command arguments.
4. Inspect the private result. Keep the reservation permanently. No automatic retry, reset, SAM call or public enablement follows.

This supersedes the earlier credit-only attestation requirement in the historical M4 checkpoint.

Sources: [Meta model context and pricing](https://dev.meta.ai/products/meta-model-api), [detailed rates](https://dev.meta.ai/docs/pricing-rate-limits), [spend alerts are not hard caps](https://dev.meta.ai/help/billing/spend-limit-alert), [billing](https://dev.meta.ai/help/billing/api-bill), [promotional credit terms](https://dev.meta.ai/legal/terms-of-service).
