import { LocalStore, openLocalStore } from "./store";
import { createHash, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { createMetaAdapter, type Inference } from "./meta";
import { readBounded, ServiceError } from "./errors";
import { openNeonInferenceBudget } from "./neon-inference-budget";
import { authenticateUser, parseConfiguredUsers } from "./users";
const imageLimit = 4 * 1024 * 1024;
const bodyLimit = imageLimit + 65536;
type Environment = {
  MODEL_API_KEY?: string;
  SITEWITNESS_ACCESS_CODE?: string;
  SITEWITNESS_USERS?: string;
  SITEWITNESS_PUBLIC_ORIGIN?: string;
  SITEWITNESS_STORAGE_PROVIDER?: string;
  INSPECTION_STORAGE_ENABLED?: string;
  DATABASE_URL?: string;
  INFERENCE_ENABLED?: string;
  INFERENCE_BUDGET_DRY_RUN?: string;
  INFERENCE_USER_DAILY_LIMIT?: string;
  INFERENCE_DAILY_LIMIT?: string;
  INFERENCE_CALL_LIMIT?: string;
  VERCEL?: string;
};
type AnalysisStore = Pick<LocalStore,"consume"|"reserveAnalysis"> & {close():void|Promise<void>};
export function createAnalyzeHandler(
  options: {
    env?: () => Environment;
    infer?: Inference;
    now?: () => number;
    store?: () => AnalysisStore;
  } = {},
) {
  const env = options.env ?? (() => process.env);
  const infer = options.infer ?? createMetaAdapter();
  const now = options.now ?? Date.now;
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
    let store: AnalysisStore | undefined;
    try {
      const config = env();
      const serverless = config.VERCEL === "1" || config.SITEWITNESS_STORAGE_PROVIDER === "neon-blob";
      const inferenceEnabled=config.INFERENCE_ENABLED==="true",budgetDryRun=config.INFERENCE_BUDGET_DRY_RUN==="true";
      if(inferenceEnabled&&budgetDryRun)
        throw new ServiceError(503,"Conflicting inference modes are configured.");
      if(!inferenceEnabled&&!budgetDryRun)
        throw new ServiceError(503,"Analysis is disabled pending operator authorization.");
      if(budgetDryRun&&!serverless)
        throw new ServiceError(503,"Budget acceptance mode is available only on the configured serverless adapter.");
      if (
        (inferenceEnabled&&!config.MODEL_API_KEY?.trim()) ||
        (!serverless && !config.SITEWITNESS_ACCESS_CODE?.trim())
      )
        throw new ServiceError(503, "Analysis service is not configured.");
      const origin = request.headers.get("origin");
      let expectedOrigin:string;
      if(serverless){
        try{const parsed=new URL(config.SITEWITNESS_PUBLIC_ORIGIN??"");if(parsed.protocol!=="https:"||parsed.origin!==config.SITEWITNESS_PUBLIC_ORIGIN)throw new Error();expectedOrigin=parsed.origin;}
        catch{throw new ServiceError(503,"Public origin is not configured.");}
      } else expectedOrigin=new URL(request.url).origin;
      if ((serverless && !origin) || (origin && origin !== expectedOrigin))
        throw new ServiceError(403, "Invalid request origin.");
      if (request.headers.get("sec-fetch-site") === "cross-site")
        throw new ServiceError(403, "Invalid request origin.");
      store = options.store?.() ?? (serverless?openNeonInferenceBudget(config):openLocalStore());
      store.consume("analysis-attempts", 60, 60000, now());
      let userId="local";
      if(serverless){
        const users=parseConfiguredUsers(config.SITEWITNESS_USERS);
        userId=authenticateUser(request.headers.get("authorization")??"",users).id;
      }else{
        const supplied = request.headers.get("x-sitewitness-access") ?? "";
        const digest = (text: string) => createHash("sha256").update(text).digest();
        if(supplied.length>1024||!timingSafeEqual(digest(supplied),digest(config.SITEWITNESS_ACCESS_CODE!)))
          throw new ServiceError(401,"Incorrect access code.");
      }
      // Authenticated requests share durable throttles; they do not trust client IPs.
      await store.consume("analysis-decodes", 10, 3600000, now());
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
      const limit = config.INFERENCE_DAILY_LIMIT ?? "0";
      if (!/^(0|[1-9][0-9]{0,4})$/.test(limit)) throw new ServiceError(503, "Inference budget is not configured.");
      const userLimit = config.INFERENCE_USER_DAILY_LIMIT ?? "0";
      if (!/^(0|[1-9][0-9]{0,4})$/.test(userLimit)) throw new ServiceError(503, "Inference budget is not configured.");
      const lifetimeLimit = config.INFERENCE_CALL_LIMIT ?? "0";
      if (!/^(0|[1-9][0-9]{0,5})$/.test(lifetimeLimit)) throw new ServiceError(503, "Inference budget is not configured.");
      const timestamp = now();
      await store.reserveAnalysis(userId,Number(userLimit),Number(limit),Number(lifetimeLimit),timestamp);
      if(budgetDryRun)
        throw new ServiceError(503,"Budget acceptance passed validation and reserved allowance. No model request was made.");
      const report = await infer({
        image,
        question: question.trim(),
        apiKey: config.MODEL_API_KEY!,
      });
      return json({
        report,
        model: "muse-spark-1.3",
        provenance: { kind: "ai", model: "muse-spark-1.3" },
        timestamp: new Date(now()).toISOString(),
      });
    } catch (error) {
      if (error instanceof ServiceError)
        return json({ error: error.message }, error.status, error.retryAfter);
      return json(
        { error: "Analysis could not be completed. Try again later." },
        500,
      );
    } finally { try{await store?.close();}catch{/* Closing a pool must not replace the request's safe response. */} }
  };
}
