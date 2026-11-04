# SiteWitness Preview inference policy

## Active Preview

Live Muse Spark analysis is enabled only in the public Vercel Preview. The API key stays server-side. The public inspection UI needs no login or access code. The current Preview is `https://sitewitness-fhewd1vxi-0x-baqi.vercel.app/`; Production remains unchanged.

Analysis requests use the existing pooled Neon database and the shared `sw_lock` row. The request, per-network, shared daily, and lifetime reservations remain atomic. A rejected request is not retried automatically. Input checks still bound question/context length, photo count, total upload bytes, image decoding and model response validation.

## Current finite allowances

| Guard | Preview limit |
| --- | ---: |
| Per network burst | 5/minute |
| Per network hourly | 30/hour |
| Global request attempts | 120/minute |
| Global decoded analysis requests | 100/hour |
| Per network analysis | 40/UTC day |
| Shared analyses | 100/UTC day |
| Current inference epoch | 1,000 total |

The old 2-per-network/day, 5-shared/day and 10-epoch ceilings were too restrictive. The first post-change Neon reservation audit for the hosted verification request found **per-network daily** was exhausted for that request's source network; shared daily and epoch lifetime were below their limits. No raw address is stored, so that pseudonymous counter cannot be attributed to a different visitor's earlier request. No inference history was reset.

The epoch row was updated in place. Before changing the policy, the request transaction wrote the old limits, current counter snapshot and exhausted gate names to `sw_inference_policy_audit` under revision `judge-policy-g100-i40-l1000`. Existing reservation rows remained intact. Historical SQLite lifetime usage is still explicitly unknown. The durable epoch lifetime counter is therefore only the known usage since the current Neon epoch began, not a claim about all prior usage.

Migration `011-inference-policy-audit.sql` creates the audit table. Runtime setup is idempotent and the successful hosted analysis verified the table and policy update against the existing Neon connection. Do not clear counters or change the epoch history to resolve future usage errors; make any additional allowance change an audited policy revision.

## Verification

The Preview accepted an unauthenticated browser request and returned a fresh `muse-spark-1.3` response for two new Wikimedia Commons construction photographs in one analysis call. The response remained in the same saved inspection with the human note, and a three-page PDF was generated after reopening. Local browser regression tests verify editing/review and mobile behavior as well.

Photo sources for the one-time hosted check: [Rebars.jpg (public domain)](https://commons.wikimedia.org/wiki/File:Rebars.jpg) and [Rebar.jpg (CC0)](https://commons.wikimedia.org/wiki/File:Rebar.jpg). Neither is included in the product or repository.

## Safety boundaries

- Do not put `MODEL_API_KEY` in client bundles, browser storage or responses.
- Keep analysis disabled for Production; no Production environment or deployment was changed.
- Do not publish the repository or push GitHub refs before the separate secret-history audit.
- Each user-initiated analysis consumes one finite allowance, including a model failure after reservation.
