import { createHash, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { createMetaAdapter, type Inference } from "./meta";
import { readBounded, ServiceError } from "./errors";
const imageLimit = 4 * 1024 * 1024;
const bodyLimit = imageLimit + 65536;
type Environment = {
  MODEL_API_KEY?: string;
  SITEWITNESS_ACCESS_CODE?: string;
  INFERENCE_ENABLED?: string;
};
export function createAnalyzeHandler(
  options: {
    env?: () => Environment;
    infer?: Inference;
    now?: () => number;
  } = {},
) {
  const env = options.env ?? (() => process.env);
  const infer = options.infer ?? createMetaAdapter();
  const now = options.now ?? Date.now;
  // Shared-code, per-instance limits: deliberately ignore caller-supplied IP headers.
  let attempts = { count: 0, until: 0 };
  let analyses = { count: 0, until: 0 };
  const quota = (bucket: typeof attempts, max: number, window: number) => {
    const time = now();
    if (time >= bucket.until) {
      bucket.count = 0;
      bucket.until = time + window;
    }
    if (bucket.count >= max)
      throw new ServiceError(
        429,
        "Local request limit reached. Try later.",
        Math.max(1, Math.ceil((bucket.until - time) / 1000)),
      );
    bucket.count++;
  };
  const json = (body: unknown, status = 200, retryAfter?: number) =>
    Response.json(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
      },
    });
  return async (request: Request): Promise<Response> => {
    try {
      const config = env();
      if (
        !config.MODEL_API_KEY?.trim() ||
        !config.SITEWITNESS_ACCESS_CODE?.trim()
      )
        throw new ServiceError(503, "Analysis service is not configured.");
      if (config.INFERENCE_ENABLED !== "true")
        throw new ServiceError(
          503,
          "Analysis is disabled pending operator authorization.",
        );
      const origin = request.headers.get("origin");
      if (origin && origin !== new URL(request.url).origin)
        throw new ServiceError(403, "Invalid request origin.");
      if (request.headers.get("sec-fetch-site") === "cross-site")
        throw new ServiceError(403, "Invalid request origin.");
      quota(attempts, 60, 60000);
      const supplied = request.headers.get("x-sitewitness-access") ?? "";
      const digest = (text: string) =>
        createHash("sha256").update(text).digest();
      if (
        supplied.length > 1024 ||
        !timingSafeEqual(
          digest(supplied),
          digest(config.SITEWITNESS_ACCESS_CODE),
        )
      )
        throw new ServiceError(401, "Incorrect access code.");
      const contentType = request.headers.get("content-type") ?? "";
      if (!/^multipart\/form-data;.*boundary=/i.test(contentType))
        throw new ServiceError(415, "Send a multipart photograph upload.");
      const declared = request.headers.get("content-length");
      if (declared && (!/^\d+$/.test(declared) || Number(declared) > bodyLimit))
        throw new ServiceError(
          413,
          "Upload is too large. Maximum photograph size is 4 MB.",
        );
      let form: FormData;
      try {
        const bytes = await readBounded(
          request.body,
          bodyLimit,
          AbortSignal.timeout(10000),
        );
        form = await new Response(Buffer.from(bytes), {
          headers: { "Content-Type": contentType },
        }).formData();
      } catch (error) {
        if (error instanceof ServiceError) throw error;
        throw new ServiceError(400, "Malformed or incomplete upload.");
      }
      if (
        form.getAll("photo").length !== 1 ||
        form.getAll("question").length !== 1 ||
        [...form.keys()].some((key) => !["photo", "question"].includes(key))
      )
        throw new ServiceError(
          400,
          "Provide exactly one photograph and one question.",
        );
      const photo = form.get("photo");
      const question = form.get("question");
      if (!(photo instanceof File))
        throw new ServiceError(400, "Photograph is required.");
      if (
        typeof question !== "string" ||
        !question.trim() ||
        question.length > 500
      )
        throw new ServiceError(
          400,
          "Enter an inspection question of 1–500 characters.",
        );
      if (!photo.size || photo.size > imageLimit)
        throw new ServiceError(413, "Image must be between 1 byte and 4 MB.");
      const formats: Record<string, string> = {
        "image/jpeg": "jpeg",
        "image/png": "png",
        "image/webp": "webp",
      };
      if (!formats[photo.type])
        throw new ServiceError(415, "Use JPEG, PNG, or WebP.");
      // Charge authenticated attempts before expensive decode, including malformed images.
      quota(analyses, 10, 3600000);
      let image: Uint8Array;
      try {
        const bytes = Buffer.from(await photo.arrayBuffer());
        const source = sharp(bytes, {
          limitInputPixels: 24000000,
          failOn: "warning",
        });
        const meta = await source.metadata();
        if (meta.format !== formats[photo.type] || (meta.pages ?? 1) !== 1)
          throw new Error("Unsupported image");
        image = await source
          .rotate()
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: 90 })
          .toBuffer();
        if (image.length > imageLimit)
          throw new Error("Decoded image is too large");
      } catch {
        throw new ServiceError(
          415,
          "Photograph could not be decoded. Use a non-animated JPEG, PNG, or WebP under 24 megapixels.",
        );
      }
      const report = await infer({
        image,
        question: question.trim(),
        apiKey: config.MODEL_API_KEY,
      });
      return json({
        report,
        model: "muse-spark-1.3",
        timestamp: new Date(now()).toISOString(),
      });
    } catch (error) {
      if (error instanceof ServiceError)
        return json({ error: error.message }, error.status, error.retryAfter);
      return json(
        { error: "Analysis could not be completed. Try again later." },
        500,
      );
    }
  };
}
