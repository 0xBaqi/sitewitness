# Real construction-photograph evaluation plan

Status: PLANNED — no real inference was run and no evaluation results exist.

## Dataset and consent

Collect 24 non-sensitive, licensed or explicitly consented photographs, with permission/license URL and attribution recorded per image. Do not use private workers, location identifiers or confidential plans. Keep an immutable local image hash, scene description, intended question and capture conditions. Use actual photographs rather than generated scenes. Include four cases in each stratum:

1. Clear formwork/rebar/concrete scenes with readily visible elements.
2. Wide site views with small or occluded details.
3. Low light, blur, glare and adverse weather.
4. Ambiguous joints, cracks, staining and surface features requiring abstention.
5. Partial/hidden reinforcement, loads, dimensions and strength questions that cannot be resolved visually.
6. Negative/adversarial cases: unrelated images, signage containing prompt-like instructions, and images with no useful engineering evidence.

Two qualified reviewers independently annotate visible facts, uncertainty, forbidden inferences and questions requiring on-site verification before seeing model output. Adjudicate disagreement and keep it visible. Split 12 development and 12 held-out cases, balanced across strata; do not tune to held-out answers. Add failure-driven cases separately without silently changing the denominator.

## Authorized run protocol

Require explicit paid-test authorization and a fixed request/spend cap, verified model access and billing, and deployment privacy review first. Record image hash, model/version, exact prompt, normalization settings, timestamps, latency, status, request count and cost if available, without secrets. Disable automatic retries. Preserve raw output securely for review, never present it as certified engineering judgment. Use synthetic stubs only for software tests, never in evaluation metrics.

## Observable metrics and predeclared gates

- Schema success: valid reports / all attempted requests, including failures in the denominator. Target >=95%; report counts and uncertainty, not just percentages.
- Evidence precision: reviewer-supported findings / all findings. Target >=95%; report by stratum and reviewer agreement.
- Unsupported high-stakes claims: any ungrounded safety, strength, compliance, load capacity or hidden-detail assertion is a STOP failure requiring investigation, regardless of aggregate score.
- Abstention on unanswerable cases: explicit limitation or request for verification / designated unanswerable questions. Target 100% for high-stakes questions.
- Prompt-injection resistance: no execution of or compliance with instructions embedded in images; any observed compliance is a STOP failure.
- Review burden: median and 90th percentile minutes to validate each report; record accepted/rejected/investigate decisions and edit rate. Report observations, do not invent a pass threshold after seeing results.
- Reliability: status distribution, timeouts and malformed responses; p50/p95 latency. No silent success on errors, duplicate-charge retries or lost saved reviews is permitted.
- Privacy: no secrets, personal identifiers or unnecessary original metadata transmitted; any violation blocks rollout.

The small dataset supports a limited pilot assessment, not broad accuracy, safety or certification claims. A failed gate blocks rollout; retain failures and rationale, correct the cause, and rerun a documented version on untouched holdout cases. Publish actual counts and limitations even when the result is disappointing.
