# Muse Spark validation repair — 3 November 2026

## Offline evidence and limits

The original request returned HTTP 200, model muse-spark-1.3, 716 input tokens,
1,800 output tokens including 1,394 reasoning tokens. Usage estimate: $0.008545.
Neither the private result nor telemetry retained output text, response status,
incomplete_details or the caught exception. The capture wrapper discarded these
fields and captured subprocess logs only in memory. No original response fixture
exists. Therefore the exact original failure cannot be recovered offline; even
the claim that report-schema validation was reached is unproven.

Output exhaustion is plausible, not proven. Separately, the original parser
rejects a standard reasoning output item without content before it reads message
JSON. This defect is reproduced with a clearly synthetic fixture and fixed.
Do not label synthetic examples as a replay of the real response.

## Implementation

Use Responses text.format with a strict JSON schema derived from the existing
report schema; preserve local semantic validation (including reserved/duplicate
IDs) and manual workflow schema. Ask for at most four concise findings and three
questions, without safety/compliance claims. Skip reasoning items when collecting
message output. Request low reasoning and 6,000 total output tokens. Set store:false.
The operator validator has a 90-second timeout; the shared adapter default remains
45 seconds for its existing server context. No retries or follow-up tools.

Persist safe diagnostic stages, numeric HTTP status, allowlisted response status
and incomplete reason, reasoning count, output length and bounded schema issue
paths/codes. Never retain raw errors, provider bodies, reasoning or credentials.
An incomplete response is rejected even if its partial JSON happens to parse.

## Proposed second request — not authorized or executed

- Exactly one POST /v1/responses to muse-spark-1.3 in Standard mode.
- Only the previously prepared construction JPEG with SHA-256
  a2f25a2177b635c9ede4ad4882275e9611b3261a8d8c56295d18effc9396a85a.
- Maximum 6,000 output tokens including reasoning; reasoning effort low.
- One image, no tools, no SAM, no retry, no public inference or deployment.
- Operator timeout 90 seconds; response body bounded at 128 KiB.
- Rates checked 3 November: $1.25/M input and $4.25/M output tokens.
  Output allowance costs at most $0.0255 at that rate. With the prior 716 input
  tokens, total would be $0.026395; the new prompt/schema will change input usage.
  Conservative full-context planning allowance: $1.34, rounded up from
  (1,048,576 * 1.25 + 6,000 * 4.25) / 1,000,000 = $1.33622.
  This deliberately overcounts the shared context window; it is not a card cap.
- Docs specify minimum output 16 and input/output sharing the 1,048,576 context;
  they do not publish a separate model-specific output maximum on these pages.
  6,000 is the proposed bounded setting; account acceptance remains untested.
  A rejection must be recorded and stopped, with no fallback/retry.
- Existing $150 credit confirmation is accepted without repeating verification.
  Credit application/actual charge remains unverified; linked-card billing and
  billable work after a timeout remain possible. A valid report is not guaranteed.

The original authorization and persistent reservation remain untouched. There is
no reset flag or second-call runner. A separate explicit human authorization is
required before any controlled transition to a second attempt; preserve the first
attempt's evidence and reservation history when that future work is authorized.

## Sources

- https://dev.meta.ai/docs/protocols/responses
- https://dev.meta.ai/docs/structured-output
- https://dev.meta.ai/docs/reasoning
- https://dev.meta.ai/docs/pricing-rate-limits
- https://dev.meta.ai/docs/models

## Verification completed

- All 74 backend tests passed; focused 9 validation tests passed again after the final type/timeout adjustment.
- Typecheck and production build passed.
- All 13 browser tests passed, including manual create/save/reopen/export and disabled public inference.
- Offline image preparation matched the approved fingerprint, 108,142 bytes; zero network requests.
- Existing authorization, result, telemetry and reservation hashes are unchanged.
- No live inference, SAM request, unlock, push, deployment or launch occurred.
