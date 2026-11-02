import { readFileSync, writeFileSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { relative, isAbsolute, join, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { checkApproval, validateOnce, type ValidationApproval } from "../lib/server/validation";

async function main() {
  const [mode, imagePath, approvalPath] = process.argv.slice(2);
  if (mode !== "--execute" || !imagePath || !approvalPath || process.argv.length !== 5)
    throw new Error("Use --execute IMAGE APPROVAL_JSON only after the documented live gate.");
  const directory = process.env.SITEWITNESS_VALIDATION_DIR;
  if (!directory || !isAbsolute(directory)) throw new Error("An absolute private validation directory is required.");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const realDirectory = realpathSync(directory);
  const fromRepo = relative(realpathSync(join(dirname(fileURLToPath(import.meta.url)), "..")), realDirectory);
  if (fromRepo !== ".." && !fromRepo.startsWith(".." + sep) && !isAbsolute(fromRepo))
    throw new Error("Validation data must stay outside the checkout.");
  if (process.platform !== "win32" && (statSync(realDirectory).mode & 0o077))
    throw new Error("Validation directory must be private (mode 700).");
  if (statSync(approvalPath).size > 4096) throw new Error("Approval is too large.");
  const approval = JSON.parse(readFileSync(approvalPath, "utf8")) as ValidationApproval;
  checkApproval(approval);
  if (statSync(imagePath).size > 4 * 1024 * 1024) throw new Error("Image exceeds 4 MiB.");
  const source = sharp(readFileSync(imagePath), { limitInputPixels: 24_000_000, failOn: "warning" });
  const metadata = await source.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1)
    throw new Error("Use a single JPEG, PNG, or WebP image.");
  const image = await source.rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
  const evidence = await validateOnce({
    image, apiKey: process.env.MODEL_API_KEY ?? "", approval,
    reservationPath: join(realDirectory, "muse-spark.reserved"),
  });
  writeFileSync(join(realDirectory, "muse-spark-result.json"), JSON.stringify(evidence, null, 2),
    { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ status: evidence.status, latencyMs: evidence.latencyMs,
    receipt: evidence.receipt, estimatedUsd: evidence.estimatedUsd, billingVerified: false }));
  if (evidence.status !== "response-validated") process.exitCode = 1;
}
main().catch(() => {
  console.error("Validation stopped. Check the documented preconditions; do not automatically retry or delete a reservation.");
  process.exitCode = 1;
});
