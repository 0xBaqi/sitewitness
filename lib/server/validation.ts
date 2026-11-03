import { openSync, writeSync, fsyncSync, closeSync } from "node:fs";
import { createMetaAdapter, type Inference, type InferenceReceipt, type InferenceDiagnostic, META_MAX_OUTPUT_TOKENS } from "./meta";
import { createHash } from "node:crypto";

// Full advertised 1,048,576-token input window, priced uncached, plus bounded output.
// Deliberately conservative planning estimate; NOT a provider/card spending cap.
export const CONSERVATIVE_ESTIMATE_USD = Math.ceil(
  (1_048_576 * 1.25 + META_MAX_OUTPUT_TOKENS * 4.25) / 1_000_000 * 100,
) / 100;
export type ValidationApproval = {
  authorizedAt: string;
  oneRequestAuthorized: boolean;
  linkedCardRiskAccepted: boolean;
  nonSensitiveImageConfirmed: boolean;
  imageSha256: string;
};
export function checkApproval(value: ValidationApproval, now = Date.now()) {
  const authorizedAt = Date.parse(value.authorizedAt);
  if (!Number.isFinite(authorizedAt) || authorizedAt > now ||
      value.oneRequestAuthorized !== true || value.linkedCardRiskAccepted !== true ||
      value.nonSensitiveImageConfirmed !== true || !/^[a-f0-9]{64}$/.test(value.imageSha256))
    throw new Error("Explicit one-image authorization and linked-card risk acceptance are required.");
}
export async function validateOnce(options: {
  image: Uint8Array; apiKey: string; reservationPath: string;
  approval: ValidationApproval; infer?: Inference;
}) {
  checkApproval(options.approval);
  if (!options.apiKey.trim() || options.image.length === 0 || options.image.length > 1024 * 1024)
    throw new Error("Missing credential or invalid prepared image.");
  const imageSha256 = createHash("sha256").update(options.image).digest("hex");
  if (options.approval.imageSha256 !== imageSha256)
    throw new Error("Image differs from the authorized image.");
  // Exclusive creation survives process exits. Never release on timeout or upstream failure:
  // a disconnected request may still have been billed. A second attempt needs operator review.
  const fd = openSync(options.reservationPath, "wx", 0o600);
  try {
    writeSync(fd, JSON.stringify({ reservedAt: new Date().toISOString(), maximumRequests: 1, imageSha256, authorizedAt: options.approval.authorizedAt }));
    fsyncSync(fd);
  } finally { closeSync(fd); }
  const started = Date.now();
  let receipt: InferenceReceipt | null = null;
  let diagnostic: InferenceDiagnostic | null = null;
  let report = null;
  let status = "failed-or-unknown";
  try {
    report = await (options.infer ?? createMetaAdapter(undefined, 90000))({
      image: options.image, apiKey: options.apiKey,
      question: "Describe visible construction elements and uncertainties. Do not assess structural safety or compliance.",
      onDiagnostic(value) { diagnostic = value; },
      onReceipt(value) { receipt = value; },
    });
    const observed = receipt as InferenceReceipt | null;
    status = observed?.model && observed.inputTokens !== null && observed.outputTokens !== null
      ? "response-validated" : "report-valid-usage-unverified";
  } catch { /* Never persist raw errors, headers, credentials, or provider bodies. */ }
  const usage = receipt as InferenceReceipt | null;
  return {
    diagnostic: diagnostic as InferenceDiagnostic | null, maximumOutputTokens: META_MAX_OUTPUT_TOKENS,
    status, requestedModel: "muse-spark-1.3", receipt: usage,
    timestamp: new Date().toISOString(), latencyMs: Date.now() - started,
    imageSha256,
    conservativePreflightEstimateUsd: CONSERVATIVE_ESTIMATE_USD,
    subsequentCallsDisabled: true,
    // Standard rates checked 2026-11-02. All input is priced uncached, conservatively.
    // This is a usage-based estimate, NOT a provider invoice or enforced dollar ceiling.
    estimatedUsd: usage?.inputTokens !== null && usage?.outputTokens !== null && usage
      ? (usage.inputTokens * 1.25 + usage.outputTokens * 4.25) / 1_000_000 : null,
    billingVerified: false, report,
  };
}
