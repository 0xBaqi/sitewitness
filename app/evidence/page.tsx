"use client";
import { useEffect, useState, useRef } from "react";
import { asSaved, audit, captured, fingerprint, matchesCapturedPhoto, newReview, questionAudit, type HumanReview } from "../../lib/captured";
import { deleteCaptured, loadCaptured, saveCaptured, type CapturedReview } from "../../lib/captured-storage";
import { FindingReview } from "../components/FindingReview";


export default function EvidencePage(){
  const [draft,setDraft]=useState<CapturedReview|null>(null);
  const [saved,setSaved]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [dirty,setDirty]=useState(false),[error,setError]=useState(""),[status,setStatus]=useState("");
  const [selected,setSelected]=useState(0),[photoUrl,setPhotoUrl]=useState("");
  useEffect(()=>{let active=true;loadCaptured().then(v=>{if(active)setSaved(!!v);}).catch(()=>{if(active)setError("Saved review could not be read. Nothing was overwritten.");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
  useEffect(()=>{if(!draft?.photo){setPhotoUrl("");return;}const url=URL.createObjectURL(draft.photo);setPhotoUrl(url);return()=>URL.revokeObjectURL(url);},[draft?.photo]);
  useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[dirty]);
  const autoOpened=useRef(false);
  useEffect(()=>{if(!loading&&!autoOpened.current&&new URLSearchParams(window.location.search).get("sample")==="1"){autoOpened.current=true;void openPhoto();}},[loading]);
  const mayLeave=()=>!dirty||confirm("Discard unsaved review changes? Save or export first to keep them.");
  async function openPhoto(file?:File){
    if(!mayLeave())return;setBusy(true);setError("");setStatus("Verifying photograph against the captured result…");
    try{
      if(file&&!await matchesCapturedPhoto(file))throw new Error("This photograph has no captured report. Choose the original sample or use manual inspection. No analysis request was sent.");
      const response=await fetch("/evidence/captured-construction.jpg",{cache:"no-store"});
      if(!response.ok)throw new Error("The captured photograph could not be loaded. Try opening the page again.");
      const photo=await response.blob();
      if(await fingerprint(photo)!==captured.imageSha256)throw new Error("Photograph verification failed. The report was not opened.");
      const existing=await loadCaptured();
      setDraft(existing??{human:newReview(),photo});setSaved(!!existing);setDirty(!existing);setSelected(0);
      setStatus(existing?"Your saved review is open. No new inference was performed.":"Photograph matched. Showing the genuine captured Muse result; no new inference was performed.");
    }catch(e){setError((e as Error).message);setStatus("");}finally{setBusy(false);}
  }
  async function reopen(){
    if(!mayLeave())return;setBusy(true);setError("");
    try{const value=await loadCaptured();if(!value)throw new Error("No saved review remains in this browser.");setDraft(value);setDirty(false);setSelected(0);setStatus("Saved review and photograph reopened from this browser.");}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  function change(fn:(v:HumanReview)=>HumanReview){setDraft(v=>v?{...v,human:fn(v.human)}:v);setDirty(true);setStatus("");}
  async function save(){
    if(!draft)return;setBusy(true);setError("");
    try{setDraft(await saveCaptured(draft));setSaved(true);setDirty(false);setStatus("Review and photograph saved in this browser. Export a backup.");}
    catch(e){setError((e as Error).message);setStatus("Not saved. Your draft is still open.");}finally{setBusy(false);}
  }
  async function download(){
    if(!draft)return;setBusy(true);setError("");
    try{
      const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Photograph export failed."));reader.readAsDataURL(draft.photo);});
      const value={format:"sitewitness-captured-review-v1",mode:"captured-live-result",exportedAt:new Date().toISOString(),containsUnsavedChanges:dirty,originalAI:captured,assistantAudit:{provenance:"AI-assisted visual audit; not a human sign-off",findings:audit,questions:questionAudit},humanReview:draft.human,reviewerIdentityVerified:false,photograph:{sha256:captured.imageSha256,dataUrl},localization:{status:"not-performed",boxes:[],masks:[]},notice:"Captured preliminary AI observations and separate human review. No new inference. Not an engineering certification. Browser-local record; not an authenticated cloud snapshot."};
      const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="sitewitness-captured-review.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setStatus("Exported current review, unchanged AI report, audit and photograph. Export does not save the draft.");
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function remove(){
    if(!draft||!confirm("Delete this saved review and photograph from this browser? Export first if needed."))return;
    setBusy(true);setError("");try{await deleteCaptured(draft.human.revision);setDraft(null);setSaved(false);setDirty(false);setStatus("Saved review deleted from this browser. The built-in captured sample remains available.");}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const human=draft?.human,finding=captured.report.findings[selected];
  return <main className="trace-page">
    <header className="top experience-top"><a className="brand" href="/"><span className="mark">SW</span><span>SiteWitness</span></a><nav aria-label="Workspace navigation"><a href="/#manual">Manual workspace</a><a href="#review-record">Review record</a></nav></header>
    {!draft&&<section className="panel"><p className="eyebrow">OPTIONAL CAPTURED EXAMPLE</p><h1>Review the saved example</h1><p>This report was generated previously and is not new analysis.</p><button className="primary" type="button" onClick={()=>void openPhoto()} disabled={busy||loading}>Open labeled captured example</button></section>}
    {draft&&<><section className="review-heading"><div><p className="eyebrow">EVIDENCE TRACE / CONSTRUCTION INSPECTION</p><h1>The evidence. Your judgement.</h1></div><span className="tag">META / MUSE SPARK 1.3</span></section><p className="capture-caption"><span className="capture-dot" aria-hidden="true"/> Previously generated real Meta AI report; new live analysis disabled.</p></>}
    <div className="trace-tools" id="review-record">
      <div className="tool-status"><strong>{draft?"Browser-local review":"Captured result · no new inference."}</strong><p className="save-status" role="status">{dirty?"Unsaved changes. ":""}{status|| (draft?"Review each observation, then save or export.":"Explore the real report to record your decisions.")}</p></div>
      {draft&&<div className="manual-actions"><button className="primary" disabled={busy} onClick={()=>void save()}>Save review and photograph</button><button className="secondary" disabled={busy} onClick={()=>void download()}>Export review with photograph</button></div>}
    </div>
    {error&&<p className="error" role="alert">{error}</p>}
    <details className="evidence-options"><summary>Sample selection &amp; saved review</summary>
      <section aria-label="Choose evidence" aria-busy={busy}>
        <div className="manual-heading"><h2>Choose the evidence</h2><button className="secondary" disabled={busy||loading} onClick={()=>void openPhoto()}>Open captured sample</button></div>
        <label className="trace-upload">Or select the original sample photograph<input type="file" accept="image/jpeg" disabled={busy||loading} onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void openPhoto(file);}}/></label>
        <p className="hint">Checked locally against the original or prepared image fingerprint. Nothing is uploaded. Review and export use the prepared 800 × 600 photograph.</p>
        {saved&&<button className="secondary" disabled={busy||loading} onClick={()=>void reopen()}>Reopen saved review</button>}
      </section>
    </details>
    {human&&draft&&<>
      <div className="shell trace-shell">
        <section className="panel trace-photo"><h2>01 / Source photograph</h2>{photoUrl&&<a href={photoUrl} target="_blank" rel="noreferrer"><img src={photoUrl} alt="Captured construction photograph with timber formwork, diagonal props and exposed reinforcement"/></a>}<p className="hint">Open the image to inspect it at full size. No SAM localization has been performed; no boxes or masks are available.</p><p className="notice">{captured.report.notice}</p>
          <div className="photo-findings"><h3>3 follow-up questions</h3><ol>{captured.report.unanswered_questions.map(q=><li key={q}>{q}</li>)}</ol><a href="#follow-up">Add your answers ↓</a></div>
          <details><summary>Capture provenance and usage</summary><dl><dt>Generated</dt><dd>3 November 2026 · 01:58 WAT</dd><dt>Model</dt><dd>{captured.model}</dd><dt>Response</dt><dd>HTTP 200 · structured validation passed</dd><dt>Latency</dt><dd>18.055 seconds</dd><dt>Tokens</dt><dd>1,028 input / 1,528 output, including 959 reasoning tokens</dd><dt>Estimated cost</dt><dd>$0.007779 · billing unverified</dd><dt>Image SHA-256</dt><dd className="fingerprint">{captured.imageSha256}</dd></dl></details>
        </section>
        <section className="panel trace-review" id="observations"><h2>02 / Review the observations</h2><p className="tag">ORIGINAL AI REPORT · MUSE SPARK 1.3</p><p className="summary">{captured.report.overview}</p><p className="hint">Overview audit: the broad scene is supported. Construction stage, hidden conditions and structural adequacy remain unverified. No defect is established by these four observations.</p>
          <p>{captured.report.findings.filter(f=>human.reviews[f.id as keyof typeof human.reviews]&&human.reviews[f.id as keyof typeof human.reviews]!=="unreviewed").length} of 4 decisions recorded · human review required</p>
          <nav className="finding-selector" aria-label="Select captured finding">{captured.report.findings.map((f,i)=><button className="secondary" key={f.id} aria-pressed={selected===i} onClick={()=>setSelected(i)}>{i+1}. {f.title}<span className="decision-label">{{unreviewed:"Not reviewed",accepted:"Accepted as observation",rejected:"Rejected / unsupported",investigate:"Investigate"}[human.reviews[f.id as keyof typeof human.reviews]||"unreviewed"]}</span></button>)}</nav>
          <fieldset className="manual-fields" disabled={busy}><legend>Human review · original AI text stays unchanged</legend>
            <div className="trace-original"><strong>Original AI description</strong><p>{finding.description}</p></div>
            <p className="notice"><b>AI-assisted evidence audit (not human sign-off):</b> {audit[selected]}</p>
            <FindingReview f={finding} i={selected} result={asSaved(human)} updateReview={(id,value)=>change(v=>({...v,reviews:{...v.reviews,[id]:value as "accepted"|"rejected"|"investigate"|"unreviewed"}}))} updateFinding={(id,field,value)=>change(v=>({...v,[field==="edit"?"edits":"notes"]:{...v[field==="edit"?"edits":"notes"],[id]:value}}))}/>
          </fieldset>
        </section>
      </div>
      <section className="panel trace-questions" id="follow-up"><h2>Follow-up questions</h2><p className="hint">Original AI questions, audit qualifications and human answers remain separate.</p><fieldset className="manual-fields" disabled={busy}>{captured.report.unanswered_questions.map((q,i)=><div key={q}><h3>{i+1}. {q}</h3><p className="hint">AI-assisted audit: {questionAudit[i]}</p><label>Human answer / evidence for question {i+1}<textarea rows={2} maxLength={1000} value={human.answers[i]} onChange={e=>change(v=>({...v,answers:v.answers.map((answer,j)=>i===j?e.target.value:answer)}))}/></label></div>)}</fieldset></section>
      <section className="panel trace-save"><h2>Keep a reviewable record</h2><fieldset className="manual-fields" disabled={busy}><label>Reviewer name (self-declared, optional)<input value={human.reviewer} maxLength={120} onChange={e=>change(v=>({...v,reviewer:e.target.value}))}/></label></fieldset><p className="hint">Saved in this browser profile, including the photograph. Anyone using this profile can access it. This is not authenticated cloud storage or a signed engineering report. Export includes current edits, even if not saved. The private vault currently supports manual records only.</p><div className="manual-actions">{saved&&<button className="secondary" disabled={busy} onClick={()=>void remove()}>Delete saved review</button>}</div></section>
    </>}
    <footer><span>SiteWitness / Evidence before conclusions.</span><a href="/#manual">Return to manual inspections</a></footer>
  </main>;
}
