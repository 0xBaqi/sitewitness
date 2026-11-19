import test from "node:test";
import assert from "node:assert/strict";
import { createContactHandler, resetThrottle, readContactConfig } from "../lib/server/contact";

const config = { apiKey: "re_test", to: "me@example.com", from: "site@example.com" };
const valid = { name: "Ada", email: "ada@example.com", topic: "feedback", message: "Hello, this is a real message." };
const req = (body: unknown, ip = "1.1.1.1") =>
  new Request("http://x/api/contact", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: typeof body === "string" ? body : JSON.stringify(body) });

test("sends a valid message through Resend with reply_to", async () => {
  resetThrottle();
  let sent: any;
  const handler = createContactHandler({ config: () => config, fetchImpl: (async (url: any, init: any) => { sent = { url, init }; return new Response("{}", { status: 200 }); }) as typeof fetch });
  const res = await handler(req(valid));
  assert.equal(res.status, 200);
  assert.equal(sent.url, "https://api.resend.com/emails");
  const body = JSON.parse(sent.init.body);
  assert.deepEqual(body.to, ["me@example.com"]);
  assert.equal(body.reply_to, "ada@example.com");
  assert.equal(sent.init.headers.authorization, "Bearer re_test");
});

test("escapes HTML and strips newlines from the subject", async () => {
  resetThrottle();
  let body: any;
  const handler = createContactHandler({ config: () => config, fetchImpl: (async (_u: any, init: any) => { body = JSON.parse(init.body); return new Response("{}"); }) as typeof fetch });
  await handler(req({ ...valid, name: "Eve\r\nBcc: x@y.z", message: "<script>alert(1)</script> hello there" }));
  assert.ok(!/[\r\n]/.test(body.subject));
  assert.ok(!body.html.includes("<script>"));
  assert.ok(body.html.includes("&lt;script&gt;"));
});

test("rejects invalid input with 400 and never calls the provider", async () => {
  resetThrottle();
  let called = false;
  const handler = createContactHandler({ config: () => config, fetchImpl: (async () => { called = true; return new Response("{}"); }) as typeof fetch });
  for (const bad of [{ ...valid, email: "nope" }, { ...valid, message: "short" }, { ...valid, topic: "spam" }, { ...valid, extra: 1 }, "{not json"]) {
    const res = await handler(req(bad));
    assert.equal(res.status, 400);
  }
  assert.equal(called, false);
});

test("honeypot submissions look successful but send nothing", async () => {
  resetThrottle();
  let called = false;
  const handler = createContactHandler({ config: () => config, fetchImpl: (async () => { called = true; return new Response("{}"); }) as typeof fetch });
  const res = await handler(req({ ...valid, website: "http://spam" }));
  assert.equal(res.status, 200);
  assert.equal(called, false);
});

test("returns 503 when unconfigured and 502 when the provider fails", async () => {
  resetThrottle();
  assert.equal((await createContactHandler({ config: () => null })(req(valid))).status, 503);
  const failing = createContactHandler({ config: () => config, fetchImpl: (async () => new Response("no", { status: 500 })) as typeof fetch });
  assert.equal((await failing(req(valid))).status, 502);
});

test("throttles the fourth message from one address", async () => {
  resetThrottle();
  const handler = createContactHandler({ config: () => config, fetchImpl: (async () => new Response("{}")) as typeof fetch });
  for (let i = 0; i < 3; i++) assert.equal((await handler(req(valid, "9.9.9.9"))).status, 200);
  const res = await handler(req(valid, "9.9.9.9"));
  assert.equal(res.status, 429);
  assert.ok(res.headers.get("retry-after"));
  assert.equal((await handler(req(valid, "8.8.8.8"))).status, 200);
});

test("readContactConfig requires all three variables", () => {
  assert.equal(readContactConfig({ RESEND_API_KEY: "k", CONTACT_TO_EMAIL: "a@b.c" } as any), null);
  assert.ok(readContactConfig({ RESEND_API_KEY: "k", CONTACT_TO_EMAIL: "a@b.c", CONTACT_FROM_EMAIL: "d@e.f" } as any));
});
