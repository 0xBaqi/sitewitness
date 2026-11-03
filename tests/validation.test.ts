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
    assert.equal(body.max_output_tokens,6000);
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

test("reasoning items do not prevent a valid message report", async () => {
  let diagnostic: any;
  const body = { model:"muse-spark-1.3", status:"completed", output:[
    {type:"reasoning", summary:[]},
    {type:"message", content:[{type:"output_text", text:JSON.stringify(report)}]},
  ] };
  const result = await createMetaAdapter(async (_url, options) => {
    const request = JSON.parse(String(options?.body));
    assert.equal(request.store,false);
    assert.equal(request.reasoning.effort,"low");
    assert.equal(request.text.format.type,"json_schema");
    assert.equal(request.text.format.strict,true);
    const schema=request.text.format.schema;
    assert.equal(schema.additionalProperties,false);
    assert.equal(schema.properties.findings.items.additionalProperties,false);
    assert.deepEqual([...schema.required].sort(),Object.keys(schema.properties).sort());
    return Response.json(body);
  })({image:new Uint8Array([1]),question:"synthetic",apiKey:"SYNTHETIC_KEY",onDiagnostic:d=>{diagnostic=d;}});
  assert.equal(result.overview,report.overview);
  assert.equal(diagnostic.stage,"validated");
});

// Synthetic envelopes: the original response text/status were NOT captured.
test("failure diagnostics distinguish truncation, JSON, schema, refusal and empty output without leaking text", async () => {
  const cases = [
    [{status:"incomplete",incomplete_details:{reason:"max_output_tokens"},usage:{output_tokens_details:{reasoning_tokens:1394}},output_text:'{"overview":'},"output-token-limit"],
    [{output_text:'{"overview":'},"report-json"],
    [{output_text:JSON.stringify({...report,findings:[{id:"f1",category:"SECRET PROVIDER TEXT"}]})},"report-schema"],
    [{output:[{type:"message",content:[{type:"refusal",refusal:"SECRET PROVIDER TEXT"}]}]},"refusal"],
    [{output:[{type:"reasoning",summary:[]}]},"empty-output"],
    [{status:"failed",error:{message:"SECRET PROVIDER TEXT"}},"provider-error"],
  ] as const;
  for (const [body,stage] of cases) {
    let diagnostic: any; let calls=0;
    await assert.rejects(()=>createMetaAdapter(async()=>{calls++;return Response.json(body);})({
      image:new Uint8Array([1]),question:"synthetic",apiKey:"SYNTHETIC_KEY",onDiagnostic:d=>{diagnostic=d;},
    }));
    assert.equal(diagnostic.stage,stage);
    assert.equal(calls,1);
    assert.equal(JSON.stringify(diagnostic).includes("SECRET PROVIDER TEXT"),false);
    if(stage==="report-schema") assert.ok(diagnostic.issues.some((x:any)=>x.path==="findings.0.category"));
    if(stage==="output-token-limit") assert.equal(diagnostic.reasoningTokens,1394);
  }
});

test("validation persists safe failure reason and keeps reservation after malformed output",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"sw-validation-"));
  try {
    let calls=0;
    const args={image:new Uint8Array([1]),apiKey:"SYNTHETIC_KEY",approval:approval(),reservationPath:join(dir,"reserved"),
      infer:createMetaAdapter(async()=>{calls++;return Response.json({output_text:"{"});})};
    const evidence=await validateOnce(args);
    assert.equal(evidence.diagnostic?.stage,"report-json");
    assert.equal(evidence.report,null);
    await assert.rejects(()=>validateOnce(args));
    assert.equal(calls,1);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
