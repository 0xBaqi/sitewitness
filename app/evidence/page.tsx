"use client";
import { useEffect, useState } from "react";
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
    <header className="top"><a className="brand" href="/"><span className="mark">SW</span><span>SiteWitness</span></a><span className="tag">EVIDENCE TRACE / CAPTURED RESULT</span></header>
    <section className="hero"><p className="eyebrow">PHOTOGRAPH → AI OBSERVATION → HUMAN REVIEW</p><h1>See the evidence.<br/><em>Own the judgement.</em></h1><p className="lead">Review a genuine Muse Spark report alongside its source photograph. Keep every correction and decision separate from the original AI observations.</p></section>
    <div className="availability"><strong>Captured result · no new inference.</strong> This report was generated on 3 November 2026 at 01:58 WAT. Live analysis is disabled. Only this photograph has a captured report; use <a href="/">manual inspections</a> for other photos.</div>
    <ol className="trace-steps" aria-label="Review journey"><li>Choose photograph</li><li>Inspect captured report</li><li>Review and edit</li><li>Save and export</li></ol>
    <section className="panel" aria-label="Choose evidence" aria-busy={busy}>
      <div className="manual-heading"><h2>01 / Choose the evidence</h2><button className="primary" disabled={busy||loading} onClick={()=>void openPhoto()}>Open captured sample</button></div>
      <label className="trace-upload">Or select the original sample photograph<input type="file" accept="image/jpeg" disabled={busy||loading} onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void openPhoto(file);}}/></label>
      <p className="hint">Selection is checked locally against the original or prepared image fingerprint. Your selected file is not uploaded. The prepared 800 × 600 photograph is used for review and export.</p>
      {saved&&<button className="secondary" disabled={busy||loading} onClick={()=>void reopen()}>Reopen saved review</button>}
    </section>
    {error&&<p className="error" role="alert">{error}</p>}
    <p className="save-status" role="status">{dirty?"Unsaved changes. ":""}{status}</p>
    {human&&draft&&<>
      <div className="shell trace-shell">
        <section className="panel trace-photo"><h2>02 / Source photograph</h2>{photoUrl&&<a href={photoUrl} target="_blank" rel="noreferrer"><img src={photoUrl} alt="Captured construction photograph with timber formwork, diagonal props and exposed reinforcement"/></a>}<p className="hint">Open the image to inspect it at full size. No SAM localization has been performed; no boxes or masks are available.</p><p className="notice">{captured.report.notice}</p>
          <details><summary>Capture provenance and usage</summary><dl><dt>Model</dt><dd>{captured.model}</dd><dt>Response</dt><dd>HTTP 200 · structured validation passed</dd><dt>Latency</dt><dd>18.055 seconds</dd><dt>Tokens</dt><dd>1,028 input / 1,528 output, including 959 reasoning tokens</dd><dt>Estimated cost</dt><dd>$0.007779 · billing unverified</dd><dt>Image SHA-256</dt><dd className="fingerprint">{captured.imageSha256}</dd></dl></details>
        </section>
        <section className="panel"><h2>03 / Review the observations</h2><p className="tag">ORIGINAL AI REPORT · MUSE SPARK 1.3</p><p className="summary">{captured.report.overview}</p><p className="hint">Overview audit: the broad scene is supported. Construction stage, hidden conditions and structural adequacy remain unverified. No defect is established by these four observations.</p>
          <p>{captured.report.findings.filter(f=>human.reviews[f.id as keyof typeof human.reviews]&&human.reviews[f.id as keyof typeof human.reviews]!=="unreviewed").length} of 4 decisions recorded · human review required</p>
          <nav className="finding-selector" aria-label="Select captured finding">{captured.report.findings.map((f,i)=><button className="secondary" key={f.id} aria-pressed={selected===i} onClick={()=>setSelected(i)}>{i+1}. {f.title}</button>)}</nav>
          <fieldset className="manual-fields" disabled={busy}><legend>Human review · original AI text stays unchanged</legend>
            <div className="trace-original"><strong>Original AI description</strong><p>{finding.description}</p></div>
            <p className="notice"><b>AI-assisted evidence audit (not human sign-off):</b> {audit[selected]}</p>
            <FindingReview f={finding} i={selected} result={asSaved(human)} updateReview={(id,value)=>change(v=>({...v,reviews:{...v.reviews,[id]:value as "accepted"|"rejected"|"investigate"|"unreviewed"}}))} updateFinding={(id,field,value)=>change(v=>({...v,[field==="edit"?"edits":"notes"]:{...v[field==="edit"?"edits":"notes"],[id]:value}}))}/>
          </fieldset>
        </section>
      </div>
      <section className="panel trace-questions"><h2>Follow-up questions</h2><p className="hint">Original AI questions, audit qualifications and human answers remain separate.</p><fieldset className="manual-fields" disabled={busy}>{captured.report.unanswered_questions.map((q,i)=><div key={q}><h3>{i+1}. {q}</h3><p className="hint">AI-assisted audit: {questionAudit[i]}</p><label>Human answer / evidence for question {i+1}<textarea rows={2} maxLength={1000} value={human.answers[i]} onChange={e=>change(v=>({...v,answers:v.answers.map((answer,j)=>i===j?e.target.value:answer)}))}/></label></div>)}</fieldset></section>
      <section className="panel trace-save"><h2>04 / Keep a reviewable record</h2><fieldset className="manual-fields" disabled={busy}><label>Reviewer name (self-declared, optional)<input value={human.reviewer} maxLength={120} onChange={e=>change(v=>({...v,reviewer:e.target.value}))}/></label></fieldset><p className="hint">Saved in this browser profile, including the photograph. Anyone using this profile can access it. This is not authenticated cloud storage or a signed engineering report. Export includes current edits, even if not saved. The private vault currently supports manual records only.</p><div className="manual-actions"><button className="primary" disabled={busy} onClick={()=>void save()}>Save review and photograph</button><button className="secondary" disabled={busy} onClick={()=>void download()}>Export review with photograph</button>{saved&&<button className="secondary" disabled={busy} onClick={()=>void remove()}>Delete saved review</button>}</div></section>
    </>}
    <footer><span>SiteWitness / Evidence before conclusions.</span><a href="/">Return to manual inspections</a></footer>
  </main>;
}
