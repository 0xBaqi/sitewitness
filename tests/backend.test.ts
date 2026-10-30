import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createAnalyzeHandler } from "../lib/server/analyze";
import { createMetaAdapter } from "../lib/server/meta";
import { ServiceError } from "../lib/server/errors";
// SYNTHETIC TEST DATA. All HTTP is stubbed; nothing here is model inference.
globalThis.fetch = async () => {
  throw new Error("External HTTP forbidden in backend tests");
};
const env = () => ({
  MODEL_API_KEY: "SYNTHETIC_TEST_KEY",
  SITEWITNESS_ACCESS_CODE: "SYNTHETIC_TEST_ACCESS",
  INFERENCE_ENABLED: "true",
});
const report = {
  overview: "SYNTHETIC TEST DATA",
  findings: [],
  unanswered_questions: [],
  notice: "SYNTHETIC TEST DATA",
};
const png = () =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: "#123456" } })
    .png()
    .toBuffer();
async function upload(
  options: {
    bytes?: Uint8Array;
    type?: string;
    question?: string;
    access?: string;
    duplicate?: boolean;
  } = {},
) {
  const form = new FormData();
  form.append(
    "photo",
    new Blob([Buffer.from(options.bytes ?? (await png()))], {
      type: options.type ?? "image/png",
    }),
    "SYNTHETIC_TEST_DATA.png",
  );
  form.append(
    "question",
    options.question ?? "SYNTHETIC TEST DATA: describe visible content",
  );
  if (options.duplicate) form.append("question", "duplicate");
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    body: form,
    headers: {
      "x-sitewitness-access": options.access ?? env().SITEWITNESS_ACCESS_CODE,
      origin: "http://localhost",
    },
  });
}
const handler = () => createAnalyzeHandler({ env, infer: async () => report });
for (const [name, config] of Object.entries({
  key: { ...env(), MODEL_API_KEY: "" },
  access: { ...env(), SITEWITNESS_ACCESS_CODE: "" },
  disabled: { ...env(), INFERENCE_ENABLED: "false" },
})) {
  test(`absent credential or disabled: ${name}`, async () =>
    assert.equal(
      (await createAnalyzeHandler({ env: () => config })(await upload()))
        .status,
      503,
    ));
}
test("invalid access is rejected before inference", async () =>
  assert.equal(
    (await handler()(await upload({ access: "wrong" }))).status,
    401,
  ));
for (const [name, opts, status] of [
  ["empty", { bytes: new Uint8Array() }, 413],
  ["oversize", { bytes: new Uint8Array(4 * 1024 * 1024 + 1) }, 413],
  [
    "signature-only",
    { bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]) },
    415,
  ],
  ["wrong MIME", { type: "image/jpeg" }, 415],
  ["unsupported", { type: "text/plain" }, 415],
  ["blank question", { question: "  " }, 400],
  ["long question", { question: "x".repeat(501) }, 400],
  ["duplicate", { duplicate: true }, 400],
] as const)
  test(`reject malformed upload: ${name}`, async () =>
    assert.equal((await handler()(await upload(opts))).status, status));
test("invalid multipart and bounded body without content-length", async () => {
  const headers = {
    "content-type": "multipart/form-data; boundary=X",
    "x-sitewitness-access": env().SITEWITNESS_ACCESS_CODE,
  };
  for (const [body, status] of [
    ["invalid", 400],
    ["x".repeat(4 * 1024 * 1024 + 65537), 413],
  ] as const) {
    assert.equal(
      (
        await handler()(
          new Request("http://localhost/api/analyze", {
            method: "POST",
            headers,
            body,
          }),
        )
      ).status,
      status,
    );
  }
});
test("cross-origin rejected", async () => {
  const req = await upload();
  req.headers.set("origin", "https://attacker.invalid");
  assert.equal((await handler()(req)).status, 403);
});
test("valid image decoded and metadata-free JPEG reaches typed adapter", async () => {
  const post = createAnalyzeHandler({
    env,
    infer: async (input) => {
      assert.equal((await sharp(input.image).metadata()).format, "jpeg");
      assert.equal((await sharp(input.image).metadata()).exif, undefined);
      return report;
    },
  });
  const response = await post(await upload());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(
    JSON.stringify(await response.json()).includes(env().MODEL_API_KEY),
    false,
  );
});
test("analysis quota ignores forged IP and resets by window", async () => {
  let time = 0;
  const post = createAnalyzeHandler({
    env,
    now: () => time,
    infer: async () => report,
  });
  for (let i = 0; i < 10; i++)
    assert.equal((await post(await upload())).status, 200);
  const req = await upload();
  req.headers.set("x-forwarded-for", "changed");
  const blocked = await post(req);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("retry-after"), "3600");
  time = 3600001;
  assert.equal((await post(await upload())).status, 200);
});
test("invalid authentication attempts are rate limited", async () => {
  const post = handler();
  for (let i = 0; i < 60; i++)
    assert.equal((await post(await upload({ access: "wrong" }))).status, 401);
  assert.equal((await post(await upload({ access: "wrong" }))).status, 429);
});
const input = {
  image: new Uint8Array([1]),
  question: "SYNTHETIC TEST DATA",
  apiKey: "SYNTHETIC_TEST_KEY",
};
const stub =
  (body: unknown, status = 200): typeof fetch =>
  async () =>
    Response.json(body, { status });
test("adapter parses synthetic HTTP response, fixes notice, prohibits redirects", async () => {
  const adapter = createMetaAdapter(async (url, options) => {
    assert.equal(url, "https://api.meta.ai/v1/responses");
    assert.equal(options?.redirect, "error");
    return Response.json({
      output: [
        { content: [{ type: "output_text", text: JSON.stringify(report) }] },
      ],
    });
  });
  assert.match((await adapter(input)).notice, /professional verification/);
});
for (const [name, body] of Object.entries({
  empty: {},
  null: null,
  invalid: { output_text: "no json" },
  shape: { output_text: "{}" },
  incomplete: { status: "incomplete", output_text: JSON.stringify(report) },
  oversize: { output_text: "x".repeat(131073) },
  array: { output: "bad" },
})) {
  test(`adapter rejects ${name}`, async () =>
    await assert.rejects(
      () => createMetaAdapter(stub(body))(input),
      (e: unknown) => e instanceof ServiceError && e.status === 502,
    ));
}
for (const status of [401, 429, 500])
  test(`upstream status ${status} never leaks body`, async () => {
    await assert.rejects(
      () =>
        createMetaAdapter(stub({ error: "SYNTHETIC_TEST_KEY" }, status))(input),
      (e: unknown) =>
        e instanceof ServiceError &&
        e.status === (status === 429 ? 429 : 502) &&
        !e.message.includes("SYNTHETIC_TEST_KEY"),
    );
  });
test("timeout aborts pending model request", async () => {
  const http: typeof fetch = async (_url, options) =>
    new Promise((_resolve, reject) =>
      options?.signal?.addEventListener("abort", () =>
        reject(new Error("aborted")),
      ),
    );
  await assert.rejects(
    () => createMetaAdapter(http, 5)(input),
    (e: unknown) => e instanceof ServiceError && e.status === 504,
  );
});
test("timeout covers slow model body", async () => {
  const http: typeof fetch = async () =>
    new Response(new ReadableStream({ start() {} }), {
      headers: { "Content-Type": "application/json" },
    });
  await assert.rejects(
    () => createMetaAdapter(http, 5)(input),
    (e: unknown) => e instanceof ServiceError && e.status === 504,
  );
});
test("duplicate finding IDs are rejected", async () => {
  const finding = {
    id: "same",
    category: "observation",
    title: "SYNTHETIC TEST DATA",
    description: "test",
    evidence: "test",
    limitation: "test",
  };
  await assert.rejects(() =>
    createMetaAdapter(
      stub({
        output_text: JSON.stringify({
          ...report,
          findings: [finding, finding],
        }),
      }),
    )(input),
  );
});
