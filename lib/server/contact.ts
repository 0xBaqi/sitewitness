import { z } from "zod";
import { ServiceError } from "./errors";

export const contactSchema = z
  .object({
    name: z.string().trim().min(1, "Please enter your name.").max(120),
    email: z.string().trim().email("Please enter a valid email address.").max(200),
    topic: z.enum(["feedback", "bug", "collaboration", "other"]),
    message: z.string().trim().min(10, "Please write at least a sentence.").max(4000),
    // Honeypot: real visitors never see or fill this field.
    website: z.string().max(500).optional().default(""),
  })
  .strict();
export type ContactInput = z.infer<typeof contactSchema>;

export type ContactConfig = { apiKey: string; to: string; from: string };

export function readContactConfig(env: NodeJS.ProcessEnv = process.env): ContactConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const to = env.CONTACT_TO_EMAIL?.trim();
  const from = env.CONTACT_FROM_EMAIL?.trim();
  return apiKey && to && from ? { apiKey, to, from } : null;
}

// Best-effort per-instance throttle. Serverless instances do not share memory, so
// this only slows casual repeats; the honeypot and size limits do the rest.
const hits = new Map<string, number[]>();
export function throttle(key: string, now = Date.now(), limit = 3, windowMs = 10 * 60_000) {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    throw new ServiceError(429, "Too many messages from this connection. Please try again later.", Math.ceil(windowMs / 1000));
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 500) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
}
export function resetThrottle() {
  hits.clear();
}

const stripCtl = (s: string) => s.replace(/[\r\n\u0000-\u001f]+/g, " ").trim();
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function sendContact(
  input: ContactInput,
  config: ContactConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: config.from,
      to: [config.to],
      reply_to: input.email,
      subject: `[SiteWitness · ${input.topic}] ${stripCtl(input.name)}`.slice(0, 200),
      text: `From: ${stripCtl(input.name)} <${input.email}>\nTopic: ${input.topic}\n\n${input.message}`,
      html: `<p><strong>${esc(stripCtl(input.name))}</strong> &lt;${esc(input.email)}&gt; · ${input.topic}</p><p style="white-space:pre-wrap">${esc(input.message)}</p>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new ServiceError(502, "Message could not be delivered right now.");
}

export function createContactHandler(deps: { config?: () => ContactConfig | null; fetchImpl?: typeof fetch } = {}) {
  const getConfig = deps.config ?? (() => readContactConfig());
  return async function POST(request: Request): Promise<Response> {
    const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
      });
    try {
      const length = Number(request.headers.get("content-length") ?? 0);
      if (length > 16_384) throw new ServiceError(413, "Message is too large.");
      const config = getConfig();
      if (!config) throw new ServiceError(503, "The contact form is not available right now. Please use the direct links instead.");
      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        throw new ServiceError(400, "Invalid request.");
      }
      const parsed = contactSchema.safeParse(raw);
      if (!parsed.success) throw new ServiceError(400, parsed.error.issues[0]?.message ?? "Invalid request.");
      // Silently accept bot submissions so they get no signal.
      if (parsed.data.website) return json({ ok: true });
      const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      throttle(forwarded);
      await sendContact(parsed.data, config, deps.fetchImpl);
      return json({ ok: true });
    } catch (e) {
      if (e instanceof ServiceError) {
        return json({ error: e.message }, e.status, e.retryAfter ? { "retry-after": String(e.retryAfter) } : {});
      }
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  };
}
