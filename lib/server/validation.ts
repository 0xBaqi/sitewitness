import { openSync, writeSync, fsyncSync, closeSync } from "node:fs";
import { createMetaAdapter, type Inference, type InferenceReceipt } from "./meta";
import { createHash } from "node:crypto";

export type ValidationApproval = {
  checkedAt: string;
  creditsOnlyConfirmed: boolean;
  nonSensitiveImageConfirmed: boolean;
};
export function checkApproval(value: ValidationApproval, now = Date.now()) {
  const age = now - Date.parse(value.checkedAt);
  if (!Number.isFinite(age) || age < 0 || age > 15 * 60_000 ||
      value.creditsOnlyConfirmed !== true || value.nonSensitiveImageConfirmed !== true)
    throw new Error("Fresh credit-only billing and image approval are required.");
}
export async function validateOnce(options: {
  image: Uint8Array; apiKey: string; reservationPath: string;
  approval: ValidationApproval; infer?: Inference;
}) {
  checkApproval(options.approval);
  if (!options.apiKey.trim() || options.image.length === 0 || options.image.length > 1024 * 1024)
    throw new Error("Missing credential or invalid prepared image.");
  // Exclusive creation survives process exits. Never release on timeout or upstream failure:
  // a disconnected request may still have been billed. A second attempt needs operator review.
  const fd = openSync(options.reservationPath, "wx", 0o600);
  try {
    writeSync(fd, JSON.stringify({ reservedAt: new Date().toISOString(), maximumRequests: 1 }));
    fsyncSync(fd);
  } finally { closeSync(fd); }
  const started = Date.now();
  let receipt: InferenceReceipt | null = null;
  let report = null;
  let status = "failed-or-unknown";
  try {
    report = await (options.infer ?? createMetaAdapter())({
      image: options.image, apiKey: options.apiKey,
      question: "Describe visible construction elements and uncertainties. Do not assess structural safety or compliance.",
      onReceipt(value) { receipt = value; },
    });
    const observed = receipt as InferenceReceipt | null;
    status = observed?.model && observed.inputTokens !== null && observed.outputTokens !== null
      ? "response-validated" : "report-valid-usage-unverified";
  } catch { /* Never persist raw errors, headers, credentials, or provider bodies. */ }
  const usage = receipt as InferenceReceipt | null;
  return {
    status, requestedModel: "muse-spark-1.3", receipt: usage,
    timestamp: new Date().toISOString(), latencyMs: Date.now() - started,
    imageSha256: createHash("sha256").update(options.image).digest("hex"),
    // Standard rates checked 2026-11-02. All input is priced uncached, conservatively.
    // This is a usage-based estimate, NOT a provider invoice or enforced dollar ceiling.
    estimatedUsd: usage?.inputTokens !== null && usage?.outputTokens !== null && usage
      ? (usage.inputTokens * 1.25 + usage.outputTokens * 4.25) / 1_000_000 : null,
    billingVerified: false, report,
  };
}
