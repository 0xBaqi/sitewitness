import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { reportSchema } from "../schema";
import { readBounded, ServiceError } from "./errors";
import { LocalStore, openLocalStore } from "./store";

const recordSchema = z.object({
  question: z.string().trim().min(1).max(500),
  report: reportSchema,
}).strict();
const usersSchema = z.array(z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()).min(1).max(100).refine(users =>
  new Set(users.map(u=>u.id)).size===users.length && new Set(users.map(u=>u.tokenHash)).size===users.length);

export function createInspectionHandler(options: {
  env?: () => Record<string, string | undefined>; store?: () => LocalStore; now?: () => number;
} = {}) {
  return async (request: Request) => {
    let store: LocalStore | undefined;
    const reply = (body: unknown, status=200, retryAfter?:number) => Response.json(body,{status,headers:{
      "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff",
      ...(retryAfter ? {"Retry-After":String(retryAfter)} : {}),
    }});
    try {
      const env = options.env?.() ?? process.env;
      if (env.VERCEL || env.INSPECTION_STORAGE_ENABLED !== "true") throw new ServiceError(503,"Server inspection storage is disabled.");
      const origin = request.headers.get("origin");
      if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site")==="cross-site")
        throw new ServiceError(403,"Invalid request origin.");
      let users: z.infer<typeof usersSchema>;
      try { users=usersSchema.parse(JSON.parse(env.SITEWITNESS_USERS ?? "")); }
      catch { throw new ServiceError(503,"Inspection access is not configured."); }
      if (!/^[a-f0-9]{64}$/i.test(env.SITEWITNESS_STORAGE_KEY ?? "")) throw new ServiceError(503,"Inspection storage is not configured.");
      store = options.store?.() ?? openLocalStore(env);
      const now = options.now?.() ?? Date.now();
      store.consume("inspection-attempts",60,60000,now);
      const token = request.headers.get("authorization") ?? "";
      if (!/^Bearer [A-Za-z0-9_-]{43,128}$/.test(token)) throw new ServiceError(401,"Invalid inspection credentials.");
      const hash = createHash("sha256").update(token.slice(7)).digest();
      const user = users.find(u=>timingSafeEqual(hash,Buffer.from(u.tokenHash,"hex")));
      if (!user) throw new ServiceError(401,"Invalid inspection credentials.");
      if (request.method === "GET") return reply({inspections:store.list(user.id,now)});
      if (request.method === "DELETE") {
        const id = new URL(request.url).searchParams.get("id");
        if (!id || !z.string().uuid().safeParse(id).success) throw new ServiceError(400,"Invalid inspection ID.");
        store.remove(user.id,id);
        return reply({deleted:true}); // Same response for absent and other-owner IDs.
      }
      if (request.method !== "POST") throw new ServiceError(405,"Method not supported.");
      if (request.headers.get("content-type")?.split(";")[0].trim()!=="application/json") throw new ServiceError(415,"Send a JSON inspection record.");
      const bytes = await readBounded(request.body,32768,AbortSignal.timeout(10000));
      let record: z.infer<typeof recordSchema>;
      try { record=recordSchema.parse(JSON.parse(new TextDecoder().decode(bytes))); }
      catch { throw new ServiceError(400,"Invalid inspection record."); }
      const id = randomUUID();
      const expires=store.save(user.id,id,record,now);
      return reply({id,expiresAt:new Date(expires).toISOString()},201);
    } catch(error) {
      return error instanceof ServiceError ? reply({error:error.message},error.status,error.retryAfter) : reply({error:"Inspection storage is unavailable."},503);
    } finally { store?.close(); }
  };
}
