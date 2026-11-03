# SAM 3.1 feasibility — documentation investigation only

Checked 3 November 2026. No SAM request, capability probe, upload, charge or invented geometry. The current app deliberately shows no localization. Documentation availability does not prove this account's entitlement or that SAM will segment this construction scene reliably.

## Documented API

Meta documents model ID `sam-3.1` at `POST https://api.meta.ai/v1/responses`, Bearer authentication and a user message pairing `input_text` with `input_image.image_url` (URL or data URL), with `stream:true`. A short concrete noun phrase describes one concept. A separate alternative uses genuine user-selected points/boxes; do not invent coordinates. See [segmentation overview](https://dev.meta.ai/docs/sam/overview).

One-concept prompts such as `reinforcement cage` or `timber formwork` are plausible future experiments, not validated capabilities. Multiple concepts need separate requests and therefore separate cost scope. Spatial wording and negation are unreliable; a defect question is not a segmentation prompt. See [prompt contract](https://dev.meta.ai/docs/sam/segmenting).

## Response and parser requirements

The output is special-token text in streamed `response.output_text.delta` events, completed by `response.completed`. An image uses frame `<0f>`; each sparse integer object ID precedes one box and one mask. Boxes contain integer `x1,y1,x2,y2,w,h`, optionally confidence. A mask contains `data=H,W,<encoding><payload>`; payload is base85, not base64. `~` and `!` indicate documented encodings. A completed empty output is a valid zero-match result. See [output grammar and decoding](https://dev.meta.ai/docs/sam/reading-segmentation).

Before implementation, validate a bounded streaming parser and the documented decoder with known synthetic fixtures; keep those fixtures labeled. Reject invalid dimensions/coordinates, duplicate IDs, malformed or truncated records and incomplete streams; bound image size, raster allocation, output bytes and time. Review the official decoder's coordinate/raster placement behavior rather than guessing that mask dimensions equal the full image. Mask confidence does not validate engineering meaning.

## Localization required for Evidence Trace

- Bind every result to the exact prepared-image SHA-256, orientation and dimensions; this image is 800 × 600. Preserve the object ID, concept prompt, actual model, usage, generation time and request provenance.
- Display returned geometry in the same image coordinate system. Box end coordinates are inclusive. Account for object-contain letterboxing, zoom, responsive scale and any crop offset. Verify mapping on desktop/mobile and rotated/non-square fixtures.
- For user prompts, transform actual pointer positions to oriented media pixels and clamp valid bounds. No preset invented boxes. For concept prompts, no boxes are required in the request; returned localization still needs verification.
- Require human confirmation of each finding-to-object link. SAM locates visible objects; it cannot prove a defect, structural function, load capacity, dimensions in real units or code compliance.

## Gate and cost

The [official model page](https://dev.meta.ai/models/sam-3-1) lists $2.50 per 1,000 images (nominally $0.0025/image), but actual billing, credits and request/account applicability are unverified; this is not an authorization or a hard billing cap. Any future experiment needs separate explicit approval specifying image, prompt, model, one-call limit, timeout, no retries and accepted billing exposure. Retain both Muse request locks; use a separately reviewed SAM reservation only after authorization. No API caller or unlock was added in this change.
