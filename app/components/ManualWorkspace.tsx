"use client";
import { useEffect, useRef, useState } from "react";
import { manualNotice, newManualInspection, type ManualInspection } from "../../lib/inspection";
import { reportSchema } from "../../lib/schema";
import { deleteManual, exportManual, listManual, migrateLegacyInspections, saveManual, validateManualPhoto, type StoredManual } from "../../lib/manual-storage";
import { FindingReview } from "./FindingReview";

function Photo({blob,name}:{blob:Blob;name:string}) {
  const [url,setUrl]=useState("");
  useEffect(()=>{const next=URL.createObjectURL(blob);setUrl(next);return()=>URL.revokeObjectURL(next);},[blob]);
  return url ? <img src={url} alt={`Inspection photograph: ${name}`} /> : null;
}

function questionFor(record:ManualInspection) {
  return [
    `Site/project: ${record.siteName}`,
    `Location: ${record.location}`,
    `Inspection question: ${record.question}`,
    `Human summary: ${record.report.overview}`,
    `Human notes: ${record.inspectionNotes}`,
    `Existing human observations: ${record.report.findings.filter(f=>!record.aiFindingIds.includes(f.id)).map(f=>`${f.title}: ${f.description}. Evidence: ${f.evidence}`).join(" ")}`,
  ].filter(Boolean).join("\n").slice(0,500);
}

export function ManualWorkspace({legacyError=""}:{legacyError?:string}) {
  const [records,setRecords]=useState<StoredManual[]>([]);
  const [draft,setDraft]=useState<StoredManual|null>(null);
  const [dirty,setDirty]=useState(false);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [status,setStatus]=useState("");
  const [selected,setSelected]=useState(0);
  const [analysisPhotoId,setAnalysisPhotoId]=useState("");
  const titleRef=useRef<HTMLInputElement>(null);
  const observationRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{let cancelled=false;(async()=>{try{await migrateLegacyInspections();const items=await listManual();if(!cancelled)setRecords(items);}catch(e){if(!cancelled)setError((e as Error).message);}finally{if(!cancelled)setLoading(false);}})();return()=>{cancelled=true;};},[]);
  useEffect(()=>{
    if(!dirty)return;
    const prevent=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",prevent);return()=>window.removeEventListener("beforeunload",prevent);
  },[dirty]);
  const change=(fn:(record:ManualInspection)=>ManualInspection)=>{
    setDraft(value=>value?{...value,inspection:fn(value.inspection)}:value);setDirty(true);setStatus("");setError("");
  };
  const mayLeave=()=>!dirty||window.confirm("Discard unsaved edits? Export or save first if you need to keep them.");
  function create() {
    if(!mayLeave())return;
    setDraft({inspection:newManualInspection(),photos:[]});setDirty(true);setSelected(0);setAnalysisPhotoId("");setError("");setStatus("");
    setTimeout(()=>titleRef.current?.focus(),0);
  }
  async function reopen(id:string) {
    if(!mayLeave())return;
    setBusy(true);setError("");setStatus("Loading inspection…");
    try {
      const items=await listManual();setRecords(items);
      const found=items.find(item=>item.inspection.id===id);
      if(!found)throw new Error("This inspection was deleted in another tab.");
      setDraft(found);setDirty(false);setSelected(0);setAnalysisPhotoId(found.inspection.aiAnalysis?.photoId??found.inspection.photos[0]?.id??"");setStatus("Saved inspection reopened from this browser.");
      setTimeout(()=>titleRef.current?.focus(),0);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function addPhotos(files:File[]) {
    if(!draft||!files.length)return;
    if(draft.photos.length+files.length>5){setError("Keep up to five photographs per inspection.");return;}
    setBusy(true);setError("");setStatus("Checking photographs…");
    try {
      for(const file of files)await validateManualPhoto(file);
      const metadata=files.map(file=>({id:crypto.randomUUID(),name:file.name.slice(0,255),type:file.type as "image/jpeg"|"image/png"|"image/webp",size:file.size}));
      setDraft({...draft,inspection:{...draft.inspection,photos:[...draft.inspection.photos,...metadata]},photos:[...draft.photos,...files]});
      if(!analysisPhotoId)setAnalysisPhotoId(metadata[0]?.id??"");
      setDirty(true);setStatus("Photographs added to this inspection. Save to retain them.");
    }catch(e){setError((e as Error).message);setStatus("");}finally{setBusy(false);}
  }
  async function analyze() {
    if(!draft||busy)return;
    const record=draft.inspection, index=record.photos.findIndex(photo=>photo.id===analysisPhotoId);
    if(index<0){setError("Choose a photograph to analyze.");return;}
    setBusy(true);setError("");setStatus("Sending the selected photograph and inspection context to Meta Muse Spark…");
    try {
      const metadata=record.photos[index], blob=draft.photos[index];
      const bytes=await blob.arrayBuffer();
      const imageSha256=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),b=>b.toString(16).padStart(2,"0")).join("");
      const form=new FormData();form.append("photo",new File([bytes],metadata.name,{type:metadata.type}));form.append("question",questionFor(record));
      const response=await fetch("/api/analyze",{method:"POST",credentials:"omit",body:form});
      const body:unknown=await response.json().catch(()=>null);
      if(!response.ok){const message=body&&typeof body==="object"&&"error" in body&&typeof body.error==="string"?body.error:"Analysis could not be completed. Your inspection remains open.";throw new Error(message);}
      if(!body||typeof body!=="object"||!("model" in body)||body.model!=="muse-spark-1.3"||!("timestamp" in body)||typeof body.timestamp!=="string"||!Number.isFinite(Date.parse(body.timestamp))||!("report" in body))throw new Error("Analysis provenance could not be verified. Your inspection remains open.");
      const result=reportSchema.parse(body.report), oldAi=new Set(record.aiFindingIds), human=record.report.findings.filter(f=>!oldAi.has(f.id));
      const suggestions=result.findings.map(f=>({...f,id:`ai-${crypto.randomUUID()}`}));
      const oldMaps={reviews:{...record.reviews},edits:{...(record.edits??{})},notes:{...(record.notes??{})}};
      for(const id of oldAi){delete oldMaps.reviews[id];delete oldMaps.edits[id];delete oldMaps.notes[id];}
      const aiFindingIds=suggestions.map(f=>f.id);
      const next:ManualInspection={...record,filename:record.filename||metadata.name,aiFindingIds,aiAnalysis:{model:body.model,generatedAt:body.timestamp,photoId:metadata.id,imageSha256,overview:result.overview,source:"fresh"},report:{...record.report,findings:[...human,...suggestions],unanswered_questions:result.unanswered_questions,notice:result.notice},reviews:{...oldMaps.reviews,...Object.fromEntries(aiFindingIds.map(id=>[id,"unreviewed" as const]))},edits:oldMaps.edits,notes:oldMaps.notes};
      setDraft({...draft,inspection:next});setDirty(true);setSelected(human.length);setStatus(`Fresh ${body.model} suggestions added to this inspection. Review them and save.`);
      document.getElementById("inspection-findings")?.scrollIntoView({behavior:"smooth",block:"start"});
    }catch(e){setError((e as Error).message);setStatus("");}finally{setBusy(false);}
  }
  async function save(event:React.FormEvent) {
    event.preventDefault();if(!draft||busy)return;
    setBusy(true);setError("");setStatus("Saving inspection and photographs…");
    try {
      const saved=await saveManual(draft);
      setDraft(saved);setDirty(false);setRecords(items=>[saved,...items.filter(item=>item.inspection.id!==saved.inspection.id)]);
      setStatus("Inspection saved in this browser, including photographs and AI provenance. Export a backup before clearing browser data.");
    }catch(e){setError((e as Error).message);setStatus("Not saved. Your inspection is still open.");}finally{setBusy(false);}
  }
  async function downloadJson() {
    if(!draft||busy)return;setBusy(true);setError("");setStatus("Preparing inspection export…");
    try {
      const value=await exportManual(draft),blob=new Blob([JSON.stringify(value,null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`sitewitness-inspection-${draft.inspection.id.slice(0,8)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setStatus("Exported the current inspection and photographs. Export does not save changes in this browser.");
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function remove() {
    if(!draft||!window.confirm("Delete this saved inspection and its photographs from this browser? Export a copy first if needed."))return;
    setBusy(true);setError("");
    try{await deleteManual(draft.inspection.id,draft.inspection.revision);setRecords(items=>items.filter(i=>i.inspection.id!==draft.inspection.id));setDraft(null);setDirty(false);setStatus("Inspection and photographs deleted from this browser.");}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  function removePhoto(photoId:string,index:number) {
    if(!draft)return;
    const record=draft.inspection,removingAnalysis=record.aiAnalysis?.photoId===photoId;
    const removedIds=removingAnalysis?new Set(record.aiFindingIds):new Set<string>();
    const keep=(map:Record<string,unknown>|undefined)=>Object.fromEntries(Object.entries(map??{}).filter(([id])=>!removedIds.has(id)));
    const photos=record.photos.filter(photo=>photo.id!==photoId);
    setDraft({inspection:{...record,photos,aiAnalysis:removingAnalysis?null:record.aiAnalysis,aiFindingIds:removingAnalysis?[]:record.aiFindingIds,report:removingAnalysis?{...record.report,findings:record.report.findings.filter(f=>!removedIds.has(f.id))}:record.report,reviews:keep(record.reviews) as ManualInspection["reviews"],edits:keep(record.edits) as ManualInspection["edits"],notes:keep(record.notes) as ManualInspection["notes"]},photos:draft.photos.filter((_,i)=>i!==index)});
    if(analysisPhotoId===photoId)setAnalysisPhotoId(photos[0]?.id??"");
    setSelected(0);setDirty(true);setStatus("");
  }
  const record=draft?.inspection, finding=record?.report.findings[selected], aiIds=new Set(record?.aiFindingIds??[]);
  return <section className="inspection-workspace manual-workspace" aria-labelledby="inspection-heading">
    <div className="availability" role="status"><strong>Public inspection workspace.</strong> No account or access code is required. Inspections are saved only in this browser. Analysis uses a bounded daily request allowance.</div>
    <div className="manual-heading"><div><p className="eyebrow">NEW OR SAVED INSPECTION</p><h2 id="inspection-heading">Inspection workspace</h2></div><button className="primary" type="button" onClick={create} disabled={loading||busy}>New inspection</button></div>
    <p className="hint">Your site details, photographs, human observations and Muse Spark suggestions stay together in one inspection. Nothing is sent to Meta until you choose Analyze.</p>
    {loading&&<p role="status">Loading saved inspections…</p>}
    <form onSubmit={save} aria-busy={busy}>
      {(error||legacyError)&&<p className="error" role="alert">{error||legacyError}</p>}
      <p className="save-status" role="status" aria-live="polite">{busy?status:dirty?`Unsaved changes. ${status}`:status}</p>
      {record&&draft ? <fieldset disabled={busy} className="manual-fields"><legend>Site details and observations</legend>
        <label>Site or project name<input value={record.siteName} maxLength={200} onChange={e=>change(r=>({...r,siteName:e.target.value}))}/></label>
        <label>Site location<input value={record.location} maxLength={300} onChange={e=>change(r=>({...r,location:e.target.value}))}/></label>
        <label>Inspection title or question<input ref={titleRef} value={record.question} maxLength={500} required onChange={e=>change(r=>({...r,question:e.target.value}))}/></label>
        <label>Human inspection summary<textarea rows={2} maxLength={1500} value={record.report.overview} onChange={e=>change(r=>({...r,report:{...r.report,overview:e.target.value}}))}/></label>
        <label>Human notes<textarea rows={2} maxLength={3000} value={record.inspectionNotes} onChange={e=>change(r=>({...r,inspectionNotes:e.target.value}))}/></label>
        <label>Add construction photographs<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value="";void addPhotos(files);}}/></label>
        <p className="hint">Up to five JPEG, PNG, or WebP photographs, 4 MB each and under 24 megapixels. Select one photograph below for analysis.</p>
        <div className="manual-photos">{record.photos.map((photo,index)=><figure key={photo.id}><Photo blob={draft.photos[index]} name={photo.name}/><figcaption>{photo.name}</figcaption><label className="photo-select"><input type="radio" name="analysis-photo" checked={analysisPhotoId===photo.id} onChange={()=>setAnalysisPhotoId(photo.id)}/> Analyze this photograph</label><button type="button" className="secondary" aria-label={`Remove photograph ${photo.name}`} onClick={()=>removePhoto(photo.id,index)}>Remove photograph</button></figure>)}</div>
        {record.photos.length>0&&<div className="analysis-action"><button type="button" className="primary" onClick={()=>void analyze()} disabled={busy||!record.question.trim()||!analysisPhotoId}>Analyze with Meta Muse Spark</button><p className="hint">One selected photograph and up to 500 characters of site context are sent to Meta. Requests are rate-limited; a completed request uses one allowance and is never retried automatically.</p></div>}
        {record.aiAnalysis&&<section className="ai-overview" aria-label="Muse Spark analysis"><p className="eyebrow">FRESH MUSE SPARK SUGGESTIONS · REVIEW REQUIRED</p><h3>AI overview</h3><p>{record.aiAnalysis.overview}</p><p className="hint">{record.aiAnalysis.model} · {record.aiAnalysis.source==="fresh"?new Date(record.aiAnalysis.generatedAt??"").toLocaleString():"Imported saved analysis; original time unavailable"} · Image SHA-256 {record.aiAnalysis.imageSha256??"unavailable in saved record"}</p></section>}
        <div className="manual-heading" id="inspection-findings"><h3>Observations and suggestions</h3><button type="button" className="secondary" disabled={record.report.findings.filter(f=>!aiIds.has(f.id)).length>=12} onClick={()=>{
          const id=crypto.randomUUID();change(r=>({...r,report:{...r.report,findings:[...r.report.findings,{id,category:"observation",title:"",description:"",evidence:"",limitation:""}]}}));setSelected(record.report.findings.length);setTimeout(()=>observationRef.current?.focus(),0);
        }}>Add human observation</button></div>
        {!record.report.findings.length&&<p className="muted">No observations or suggestions yet. Add your own observation or analyze a photograph.</p>}
        <nav className="finding-selector" aria-label="Inspection findings">{record.report.findings.map((f,i)=><button type="button" className="secondary" aria-pressed={i===selected} key={f.id} onClick={()=>setSelected(i)}>{i+1}. {aiIds.has(f.id)?"Muse Spark · ":"Human · "}{f.title||"Untitled observation"}</button>)}</nav>
        {finding&&<div className="manual-observation" key={finding.id}>
          <p className="eyebrow">{aiIds.has(finding.id)?"MUSE SPARK SUGGESTION · VERIFY AGAINST THE PHOTOGRAPH":"HUMAN OBSERVATION"}</p>
          <label>{aiIds.has(finding.id)?"Suggested title":"Observation title"}<input ref={observationRef} required maxLength={160} value={finding.title} onChange={e=>change(r=>({...r,report:{...r.report,findings:r.report.findings.map(f=>f.id===finding.id?{...f,title:e.target.value}:f)}}))}/></label>
          <label>Category<select value={finding.category} onChange={e=>change(r=>({...r,report:{...r.report,findings:r.report.findings.map(f=>f.id===finding.id?{...f,category:e.target.value as typeof f.category}:f)}}))}><option value="observation">Observation</option><option value="potential_concern">Potential concern</option><option value="needs_verification">Needs verification</option></select></label>
          <FindingReview f={finding} i={selected} result={record} aiSuggestion={aiIds.has(finding.id)} updateReview={(id,value)=>change(r=>({...r,reviews:{...r.reviews,[id]:value as "accepted"|"rejected"|"investigate"|"unreviewed"}}))} updateFinding={(id,field,value)=>change(r=>field==="note"?{...r,notes:{...r.notes,[id]:value}}:aiIds.has(id)?{...r,edits:{...r.edits,[id]:value}}:{...r,report:{...r.report,findings:r.report.findings.map(f=>f.id===id?{...f,description:value}:f)}})}/>
          {!aiIds.has(finding.id)&&<label>Evidence noted<textarea maxLength={800} value={finding.evidence} onChange={e=>change(r=>({...r,report:{...r.report,findings:r.report.findings.map(f=>f.id===finding.id?{...f,evidence:e.target.value}:f)}}))}/></label>}
          <label>Limitations noted<textarea maxLength={800} value={finding.limitation} onChange={e=>change(r=>({...r,report:{...r.report,findings:r.report.findings.map(f=>f.id===finding.id?{...f,limitation:e.target.value}:f)}}))}/></label>
          {!aiIds.has(finding.id)&&<button type="button" className="secondary" onClick={()=>{change(r=>{const reviews={...r.reviews},notes={...r.notes},edits={...r.edits};delete reviews[finding.id];delete notes[finding.id];delete edits[finding.id];return {...r,reviews,notes,edits,report:{...r.report,findings:r.report.findings.filter(f=>f.id!==finding.id)}};});setSelected(0);}}>Remove observation</button>}
        </div>}
        {record.report.unanswered_questions.length>0&&<section className="questions"><strong>Follow-up questions</strong><ul>{record.report.unanswered_questions.map((q,i)=><li key={i}>{q}</li>)}</ul></section>}
        <p className="notice">{record.aiAnalysis?record.report.notice:manualNotice}</p>
        <div className="manual-actions"><button type="submit" className="primary">{busy?"Please wait…":"Save inspection"}</button><button type="button" className="secondary" onClick={()=>window.print()}>Print / save PDF</button><button type="button" className="secondary" onClick={downloadJson}>Export JSON backup</button>{record.revision>0&&<button type="button" className="secondary" onClick={remove}>Delete saved inspection</button>}</div>
        <div className="print-report"><h1>SiteWitness · Site Inspection Report</h1><p><b>Site/project:</b> {record.siteName||"Not provided"}</p><p><b>Location:</b> {record.location||"Not provided"}</p><p><b>Inspection:</b> {record.question}</p><p><b>Date:</b> {new Date(record.date).toLocaleString()}</p>{record.report.overview&&<><h2>Human inspection summary</h2><p>{record.report.overview}</p></>}{record.inspectionNotes&&<><h2>Human notes</h2><p>{record.inspectionNotes}</p></>}{record.photos.map((photo,index)=><figure key={photo.id}><Photo blob={draft.photos[index]} name={photo.name}/><figcaption>{photo.name}</figcaption></figure>)}{record.aiAnalysis&&<><h2>Muse Spark overview</h2><p>{record.aiAnalysis.overview}</p><p>{record.aiAnalysis.model} · {record.aiAnalysis.generatedAt?new Date(record.aiAnalysis.generatedAt).toLocaleString():"Imported report; timestamp unavailable"}</p><p>Analyzed image SHA-256: {record.aiAnalysis.imageSha256??"unavailable"}</p></>}<h2>Observations and suggestions</h2>{record.report.findings.map((f,i)=><article key={f.id}><h3>{i+1}. {aiIds.has(f.id)?"Muse Spark suggestion: ":"Human observation: "}{f.title}</h3><p><b>Original description:</b> {f.description}</p>{record.edits?.[f.id]&&<p><b>Reviewed description:</b> {record.edits[f.id]}</p>}<p><b>Evidence:</b> {f.evidence||"Not specified"}</p><p><b>Limitation:</b> {f.limitation||"Requires further review"}</p><p><b>Decision:</b> {record.reviews[f.id]??"Not reviewed"}</p>{record.notes?.[f.id]&&<p><b>Reviewer notes:</b> {record.notes[f.id]}</p>}</article>)}{record.report.unanswered_questions.length>0&&<><h2>Follow-up questions</h2><ul>{record.report.unanswered_questions.map((q,i)=><li key={i}>{q}</li>)}</ul></>}<p>{record.aiAnalysis?record.report.notice:manualNotice}</p></div>
      </fieldset>:!loading&&<p className="empty-manual">Start with “New inspection”. Add site details, human observations and photographs in one place.</p>}
    </form>
    <h3>Saved inspections</h3>
    {!loading&&!records.length&&<p>No inspections saved yet.</p>}
    <div className="records">{records.map(({inspection})=><button className="record" key={inspection.id} disabled={busy} onClick={()=>void reopen(inspection.id)}><span>{inspection.aiAnalysis?"Human review + Muse Spark":"Human-authored inspection"}</span><strong>{inspection.question}</strong><small>{inspection.report.findings.length} findings · {inspection.photos.length} photographs</small></button>)}</div>
  </section>;
}
