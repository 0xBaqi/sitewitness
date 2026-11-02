# M4 controlled Meta validation

The public /api/analyze route remains code-locked. Environment flags cannot unlock it.
The CLI is an operator-only experiment, not a public inference service.

## Before any live request

1. Verify the correct Meta team/project has active credits, their expiry, and no paid fallback or auto-recharge. Record provider evidence privately. If credit-only operation cannot be established, STOP. A request limit is not a monetary cap.
2. Have the operator supply the existing key securely as MODEL_API_KEY. Never paste it into chat, command arguments, logs or source. Do not create a replacement key without authorization.
3. Inspect one non-sensitive construction photograph. The CLI decodes, orients, strips metadata and resizes it to at most 1024 pixels per side. No upload occurs before execution.
4. In a private directory outside the checkout (mode 700), create an approval JSON containing checkedAt (current ISO time), creditsOnlyConfirmed:true and nonSensitiveImageConfirmed:true. These are operator attestations, NOT automated proof of account billing state. They expire after 15 minutes.
5. Set SITEWITNESS_VALIDATION_DIR to that absolute private directory. Run with the securely supplied environment:
   node --import tsx scripts/validate-meta.ts --execute /absolute/photo.jpg /absolute/approval.json

Exactly one inference fetch is allowed per durable reservation. Output is limited to 1800 tokens, HTTP redirects are rejected, the response has a size bound and the request times out. There are no automatic retries. Keep the same reservation directory across process restarts. Never delete the reservation or switch directories to retry without inspecting account usage and obtaining a new controlled-test decision. A timeout does not prove no charge occurred.

The private result records the prepared image SHA-256, requested/returned model, actual token usage when supplied, elapsed time and schema-validated report. Missing model/usage does not pass the full response gate. Raw provider errors and headers are not recorded. Report output remains untrusted preliminary observations requiring human review.

The usage-based USD estimate uses standard uncached input $1.25/M and output $4.25/M, checked 2026-11-02. It is not a hard spend ceiling or confirmed charge; compare against Meta's account ledger before claiming verified cost. No tools, search, contributor mode, or background jobs are enabled.

## Evidence Trace next gate

Official SAM documentation uses model sam-3.1 (not the marketing-page spelling sam-3-1). It accepts an image and one concrete noun phrase via Responses. Geometry is special-token output; use the documented @meta-sam/parser for masks and boxes rather than treating VLM prose as coordinates. Empty output is a valid zero-match result. Associate validated geometry with the exact image hash and a reviewed finding; segmentation does not prove a defect or engineering conclusion.

SAM is documentation-confirmed only at this point. No live access, parser integration, localization or visual overlay is claimed.

Sources:
- https://dev.meta.ai/docs/image-understanding
- https://dev.meta.ai/docs/pricing-rate-limits
- https://dev.meta.ai/docs/token-counting (context count is explicitly not billing usage)
- https://dev.meta.ai/docs/sam/overview
