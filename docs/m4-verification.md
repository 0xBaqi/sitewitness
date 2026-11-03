> Historical checkpoint: the credit-only attestation requirement below is superseded by [the one-request authorization gate](m4-controlled-validation.md). The previously confirmed $150 balance is accepted; explicit residual linked-card risk approval remains required.

# SiteWitness M4 checkpoint — 2 November 2026

## Outcome

Controlled Muse Spark validation tooling is implemented and locally tested. No Meta inference request was made. Real Muse Spark output, account charges, SAM localization and remote Neon/Blob persistence remain unverified.

## Repository and changes

Inspected the actual Ubuntu checkout at /home/baronal/projects/sitewitness/sitewitness-starter, starting at c7c8874 on the existing feature branch. Existing uncommitted changes were the Vercel ignore entry and SW favicon; both are included in the reviewed checkpoint.

Added an operator-only single-request validator. It requires a fresh operator attestation of credit-only billing and a reviewed non-sensitive image. It strips image metadata, limits image dimensions, reserves the attempt durably before inference, disallows automatic retries, and preserves that reservation after uncertain failures. The shared adapter captures numeric usage and returned model without exposing headers or keys, rejects unexpected model identities and credential echoes, and retains schema validation.

The private result records the prepared-image hash, timestamp, elapsed time, actual token usage when available, and preliminary report. The USD figure is a usage-based estimate, not a hard monetary limit or provider invoice. Account-level credit-only operation must still be verified before execution. The public analysis route remains locked in code.

## Verification

- Four new controlled-validation tests passed; all 65 existing backend tests passed. The standard backend command now includes the new tests.
- Typecheck and production build passed, including /icon.svg.
- All 13 browser tests and the authenticated local vault test passed.
- Restart/expiry/isolation smoke test passed on the final run. Two earlier runs timed out; request-stage diagnostics were added without relaxing timeouts. Heavy local process load was observed, but the cause of those timeouts is not conclusively established.
- Dependency audit: zero reported vulnerabilities using the same lockfile through Windows. Two Ubuntu advisory requests failed to connect first.
- Gitleaks 8.30.1 was downloaded from its official release and checked against the published SHA-256. It scanned all 14 local-history commits (~402 KB). One generic-key match was an explicit placeholder in deploy/sitewitness.env.example, not a valid 64-hex storage key. No history was rewritten and repository visibility was not changed. Automated scanning does not guarantee absence of every secret.

## Current live evidence

Vercel reports sitewitness-ep57w5b3e-0x-baqi.vercel.app READY as Preview. Unauthenticated root and favicon HTTP requests returned 302 redirects; this session did not independently complete the hosted manual judge journey. The earlier successful three-photo save/refresh/export remains user-reported evidence.

After the user's update, Vercel metadata confirms exactly one MODEL_API_KEY for Preview, marked sensitive. No value was displayed or downloaded. The user then saved the key locally. A boolean-only check confirmed that loading .env.local supplies a nonempty key, the file has owner-only permissions and is Git-ignored, and INFERENCE_ENABLED remains false. The validator can load it without exposing it in command arguments or logs. The key's validity has not been tested against Meta. A sensitive Vercel secret is available to deployments, not readable back locally.

The exact staged changes also passed a redacted Gitleaks scan with no findings. All reviewed changes were committed locally; no push occurred.

The supplied export sitewitness-manual-27615372.json was found in Downloads. One embedded JPEG was extracted locally and visually inspected; it was not sent to Meta, added to Git, or published.

SITEWITNESS_PUBLIC_ORIGIN is still absent from the current Vercel environment metadata. Neon schema creation and private Blob connection remain prior/user-reported; live authenticated save/restore, isolation, deletion and durability were not verified here.

## Pending gates

1. Secure local key injection and boolean presence check: complete. Meta account authentication remains at the sign-in screen in this chat's browser.
2. Verify active credits, expiry, and disabled auto-recharge/paid fallback for the correct Meta account. No live request until credit-only operation is established.
3. Run one Muse Spark request on the reviewed photo, inspect the actual report, and reconcile usage against the account ledger.
4. SAM 3.1: official documentation confirms model sam-3.1 and real mask/box output, but account access, parser integration and Evidence Trace are not implemented or live-tested. Do not substitute invented coordinates.
5. Resolve exact Preview origin and complete remote Neon/Blob acceptance and authenticated judge testing.

Baronal V2 is applied through repository inspection, meaningful integration gates, preserved manual workflow, fresh automated verification and explicit live-versus-local evidence. No separate independent reviewer is claimed. No production promotion, paid upgrade, new API key creation, public inference enablement, push or deployment was performed.

Sources checked: [Meta image understanding](https://dev.meta.ai/docs/image-understanding), [pricing](https://dev.meta.ai/docs/pricing-rate-limits), [token counting](https://dev.meta.ai/docs/token-counting), [SAM](https://dev.meta.ai/docs/sam/overview), [Vercel secret variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables).
