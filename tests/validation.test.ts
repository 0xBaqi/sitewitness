import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkApproval, validateOnce } from "../lib/server/validation";
import { createMetaAdapter } from "../lib/server/meta";
const report = { overview: "SYNTHETIC TEST DATA", findings: [], unanswered_questions: [], notice: "synthetic" };
const approval = () => ({ authorizedAt: new Date().toISOString(), oneRequestAuthorized: true,
  linkedCardRiskAccepted: true, nonSensitiveImageConfirmed: true,
  imageSha256: createHash("sha256").update(new Uint8Array([1])).digest("hex") });
test("missing authorization, risk acceptance or image confirmation fails closed", () => {
  for (const value of [{...approval(), linkedCardRiskAccepted:false}, {...approval(), nonSensitiveImageConfirmed:false},
    {...approval(), authorizedAt:"invalid"}, {...approval(), oneRequestAuthorized:false}])
    assert.throws(() => checkApproval(value));
});
test("one durable request only, including concurrent starts and uncertain failures", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sw-validation-"));
  let calls = 0;
  try {
    const args = { image: new Uint8Array([1]), apiKey:"synthetic", approval:approval(),
      reservationPath:join(dir,"reserved"), infer:async () => {calls++; throw new Error("SECRET PROVIDER ERROR");} };
    const results = await Promise.allSettled([validateOnce(args), validateOnce(args)]);
    assert.equal(calls,1);
    assert.equal(results.filter(x => x.status==="rejected").length,1);
    assert.ok(existsSync(args.reservationPath));
    assert.equal(JSON.stringify(results).includes("SECRET PROVIDER ERROR"), false);
    await assert.rejects(() => validateOnce(args));
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
test("usage, actual model and valid report are required for verified response status", async () => {
  const dir=mkdtempSync(join(tmpdir(),"sw-validation-"));
  try {
    const evidence=await validateOnce({image:new Uint8Array([1]),apiKey:"synthetic",approval:approval(),
      reservationPath:join(dir,"reserved"), infer:async input => {
        input.onReceipt?.({model:"muse-spark-1.3",inputTokens:100,outputTokens:20}); return report;
      }});
    assert.equal(evidence.status,"response-validated");
    assert.equal(evidence.estimatedUsd,0.00021);
    assert.equal(evidence.billingVerified,false);
    assert.equal(evidence.imageSha256.length,64);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test("adapter captures safe usage and rejects mismatched model or credential echo", async () => {
  const input={image:new Uint8Array([1]),question:"SYNTHETIC",apiKey:"SYNTHETIC_KEY"};
  let receipt: unknown;
  const body={model:"muse-spark-1.3",usage:{input_tokens:20,output_tokens:10},output_text:JSON.stringify(report)};
  await createMetaAdapter(async()=>Response.json(body))({...input,onReceipt:r=>{receipt=r;}});
  assert.deepEqual(receipt,{model:"muse-spark-1.3",inputTokens:20,outputTokens:10});
  for (const invalid of [{...body,model:"another-model"},
    {...body,output_text:JSON.stringify({...report,overview:input.apiKey})}])
    await assert.rejects(()=>createMetaAdapter(async()=>Response.json(invalid))(input));
});

test("approval cannot be reused for a different image and does not reserve or call", async () => {
  const dir=mkdtempSync(join(tmpdir(),"sw-validation-")); let calls=0;
  try {
    const reservationPath=join(dir,"reserved");
    await assert.rejects(()=>validateOnce({image:new Uint8Array([2]),apiKey:"synthetic",
      approval:approval(),reservationPath,infer:async()=>{calls++;return report;}}));
    assert.equal(calls,0); assert.equal(existsSync(reservationPath),false);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test("real adapter sends one image, bounded output, no tools and never retries a rejection", async () => {
  let calls=0;
  const adapter=createMetaAdapter(async (_url,options) => {
    calls++;
    const body=JSON.parse(String(options?.body));
    assert.equal(body.max_output_tokens,1800);
    assert.equal(body.model,"muse-spark-1.3");
    assert.equal(body.input.length,1);
    assert.equal(body.input[0].content.filter((x: {type:string})=>x.type==="input_image").length,1);
    assert.equal(body.tools,undefined); assert.equal(body.background,undefined);
    assert.equal(options?.redirect,"error");
    return Response.json({}, {status:429});
  });
  await assert.rejects(()=>adapter({image:new Uint8Array([1]),question:"synthetic",apiKey:"synthetic"}));
  assert.equal(calls,1);
});
