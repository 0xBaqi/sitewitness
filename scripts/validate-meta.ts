import { readFileSync, writeFileSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { checkApproval, validateOnce, CONSERVATIVE_ESTIMATE_USD, type ValidationApproval } from "../lib/server/validation";

async function main() {
  const [mode, imagePath, approvalPath] = process.argv.slice(2);
  if (!imagePath || !((mode === "--prepare" && process.argv.length === 4) ||
      (mode === "--execute" && approvalPath && process.argv.length === 5)))
    throw new Error("Use --prepare IMAGE, or --execute IMAGE APPROVAL_JSON after explicit approval.");
  // Canonical fixed reservation, independent of output paths or environment overrides.
  // No reset flag: another live call requires a separate, explicit operator decision.
  const checkout = realpathSync(join(dirname(fileURLToPath(import.meta.url)), ".."));
  const directory = join(dirname(checkout), ".sitewitness-validation");
  if (statSync(imagePath).size > 4 * 1024 * 1024) throw new Error("Image exceeds 4 MiB.");
  const source = sharp(readFileSync(imagePath), { limitInputPixels: 24_000_000, failOn: "warning" });
  const metadata = await source.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1)
    throw new Error("Use a single JPEG, PNG, or WebP image.");
  const image = await source.rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
  if (mode === "--prepare") {
    console.log(JSON.stringify({ imageSha256: createHash("sha256").update(image).digest("hex"),
      preparedBytes: image.length, maximumOutputTokens: 1800,
      conservativeEstimateUsd: CONSERVATIVE_ESTIMATE_USD, networkRequests: 0 }));
    return;
  }
  if (statSync(approvalPath).size > 4096) throw new Error("Approval is too large.");
  const approval = JSON.parse(readFileSync(approvalPath, "utf8")) as ValidationApproval;
  checkApproval(approval);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (realpathSync(directory) !== directory ||
      (process.platform !== "win32" && (statSync(directory).mode & 0o077)))
    throw new Error("Validation directory must be private and not a symlink.");
  const evidence = await validateOnce({
    image, apiKey: process.env.MODEL_API_KEY ?? "", approval,
    reservationPath: join(directory, "muse-spark.reserved"),
  });
  writeFileSync(join(directory, "muse-spark-result.json"), JSON.stringify(evidence, null, 2),
    { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ status: evidence.status, latencyMs: evidence.latencyMs,
    receipt: evidence.receipt, estimatedUsd: evidence.estimatedUsd, billingVerified: false }));
  if (evidence.status !== "response-validated") process.exitCode = 1;
}
main().catch(() => {
  console.error("Validation stopped. Check the documented preconditions; do not automatically retry or delete a reservation.");
  process.exitCode = 1;
});
