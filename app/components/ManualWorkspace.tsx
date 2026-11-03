"use client";
import { useEffect, useRef, useState } from "react";
import { manualNotice, newManualInspection, type ManualInspection } from "../../lib/inspection";
import { deleteManual, exportManual, listManual, saveManual, validateManualPhoto, type StoredManual } from "../../lib/manual-storage";
import { FindingReview } from "./FindingReview";

function Photo({blob,name}:{blob:Blob;name:string}) {
  const [url,setUrl]=useState("");
  useEffect(()=>{const next=URL.createObjectURL(blob);setUrl(next);return()=>URL.revokeObjectURL(next);},[blob]);
  return url ? <img src={url} alt={`Manual inspection photograph: ${name}`} /> : null;
}
export function ManualWorkspace({legacyError}:{legacyError:string}) {
  const [records,setRecords]=useState<StoredManual[]>([]);
  const [draft,setDraft]=useState<StoredManual|null>(null);
  const [dirty,setDirty]=useState(false);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [status,setStatus]=useState("");
  const [selected,setSelected]=useState(0);
  const titleRef=useRef<HTMLInputElement>(null);
  const observationRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{let cancelled=false;listManual().then(items=>{if(!cancelled)setRecords(items);}).catch(e=>{if(!cancelled)setError(e.message);}).finally(()=>{if(!cancelled)setLoading(false);});return()=>{cancelled=true;};},[]);
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
    setDraft({inspection:newManualInspection(),photos:[]});setDirty(true);setSelected(0);setError("");setStatus("");
    setTimeout(()=>titleRef.current?.focus(),0);
  }
  async function reopen(id:string) {
    if(!mayLeave())return;
    setBusy(true);setError("");setStatus("Loading inspection…");
    try {
      const items=await listManual();setRecords(items);
      const found=items.find(item=>item.inspection.id===id);
      if(!found)throw new Error("This inspection was deleted in another tab.");
      setDraft(found);setDirty(false);setSelected(0);setStatus("Saved inspection reopened from this browser.");
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
      setDirty(true);setStatus("Photographs added to draft. Save to retain them.");
    }catch(e){setError((e as Error).message);setStatus("");}finally{setBusy(false);}
  }
  async function save(event:React.FormEvent) {
    event.preventDefault();if(!draft||busy)return;
    setBusy(true);setError("");setStatus("Saving inspection and photographs…");
    try {
      const saved=await saveManual(draft);
      setDraft(saved);setDirty(false);setRecords(items=>[saved,...items.filter(item=>item.inspection.id!==saved.inspection.id)]);
      setStatus("Saved in this browser, including photographs. Export a backup before clearing browser data.");
    }catch(e){setError((e as Error).message);setStatus("Not saved. Your draft is still open.");}finally{setBusy(false);}
  }
  async function download() {
    if(!draft||busy)return;setBusy(true);setError("");setStatus("Preparing export…");
    try {
      const value=await exportManual(draft);
      const blob=new Blob([JSON.stringify(value,null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob),a=document.createElement("a");
      a.href=url;a.download=`sitewitness-manual-${draft.inspection.id.slice(0,8)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setStatus("Exported the current draft and photographs. Export does not save changes in this browser.");
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function remove() {
    if(!draft||!window.confirm("Delete this saved inspection and its photographs from this browser? Export a copy first if needed."))return;
    setBusy(true);setError("");
    try{await deleteManual(draft.inspection.id,draft.inspection.revision);setRecords(items=>items.filter(i=>i.inspection.id!==draft.inspection.id));setDraft(null);setDirty(false);setStatus("Inspection and photographs deleted from this browser.");}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const record=draft?.inspection, finding=record?.report.findings[selected];
  return <section className="manual-workspace" aria-labelledby="manual-heading">
    <div className="availability" role="status"><strong>Your observations. Your inspection.</strong> Add any site photograph and record what you see. New live AI analysis is disabled; this manual workflow sends nothing to Meta.</div>
    <div className="manual-heading"><div><p className="eyebrow">HUMAN-AUTHORED · NO AI FINDINGS</p><h2 id="manual-heading">Manual inspections</h2></div><button className="primary" onClick={create} disabled={loading||busy}>New manual inspection</button></div>
    <p className="hint">Create an inspection, add photographs and observations, then save. This workspace is private to this browser profile, not a signed-in account. Anyone using this profile can access it. Exported JSON includes photographs and may contain sensitive information.</p>
    {loading&&<p role="status">Loading saved manual inspections…</p>}
    <form onSubmit={save} aria-busy={busy}>
      {(error||legacyError)&&<p className="error" role="alert">{error||legacyError}</p>}
      <p className="save-status" role="status" aria-live="polite">{busy?status:dirty?`Unsaved changes. ${status}`:status}</p>
      {record&&draft ? <fieldset disabled={busy} className="manual-fields"><legend>Human-authored inspection</legend>
        <label>Inspection title<input ref={titleRef} value={record.question} maxLength={500} required onChange={e=>change(r=>({...r,question:e.target.value}))}/></label>
        <label>Inspection summary<textarea rows={2} maxLength={1500} value={record.report.overview} onChange={e=>change(r=>({...r,report:{...r.report,overview:e.target.value}}))}/></label>
        <label>Inspection notes<textarea rows={2} maxLength={3000} value={record.inspectionNotes} onChange={e=>change(r=>({...r,inspectionNotes:e.target.value}))}/></label>
        <label>Add photographs<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value="";void addPhotos(files);}}/></label>
        <p className="hint">Up to five JPEG, PNG, or WebP photographs, 4 MB each and under 24 megapixels. Originals and their metadata stay in this browser and are included in exports.</p>
        <div className="manual-photos">{record.photos.map((photo,index)=><figure key={photo.id}><Photo blob={draft.photos[index]} name={photo.name}/><figcaption>{photo.name}</figcaption><button type="button" className="secondary" aria-label={`Remove photograph ${photo.name}`} onClick={()=>{setDraft({...draft,inspection:{...record,photos:record.photos.filter(p=>p.id!==photo.id)},photos:draft.photos.filter((_,i)=>i!==index)});setDirty(true);setStatus("");}}>Remove photograph</button></figure>)}</div>
        <div className="manual-heading"><h3>Human observations</h3><button type="button" className="secondary" disabled={record.report.findings.length>=12} onClick={()=>{
          const id=crypto.randomUUID();change(r=>({...r,report:{...r.report,findings:[...r.report.findings,{id,category:"observation",title:"",description:"",evidence:"",limitation:""}]}}));setSelected(record.report.findings.length);setTimeout(()=>observationRef.current?.focus(),0);
        }}>Add observation</button></div>
        {!record.report.findings.length&&<p className="muted">No observations yet. Add your own description of what you saw; nothing is generated automatically.</p>}
        <nav className="finding-selector" aria-label="Select human observation">{record.report.findings.map((f,i)=><button type="button" className="secondary" aria-pressed={i===selected} key={f.id} onClick={()=>setSelected(i)}>{i+1}. {f.title||"Untitled observation"}</button>)}</nav>
        {finding&&<div className="manual-observation">
          <label>Observation title<input ref={observationRef} required maxLength={160} value={finding.title} onChange={e=>change(r=>({...r,report:{...r.report,findings:r.report.findings.map(f=>f.id===finding.id?{...f,title:e.target.value}:f)}}))}/></label>
          <label>Observation category<select value={finding.category} onChange={e=>change(r=>({...r,report:{...r.report,findings:r.report.findings.map(f=>f.id===finding.id?{...f,category:e.target.value as typeof f.category}:f)}}))}><option value="observation">Observation</option><option value="potential_concern">Potential concern</option><option value="needs_verification">Needs verification</option></select></label>
          <label>Evidence noted<textarea maxLength={800} value={finding.evidence} onChange={e=>change(r=>({...r,report:{...r.report,findings:r.report.findings.map(f=>f.id===finding.id?{...f,evidence:e.target.value}:f)}}))}/></label>
          <label>Limitations noted<textarea maxLength={800} value={finding.limitation} onChange={e=>change(r=>({...r,report:{...r.report,findings:r.report.findings.map(f=>f.id===finding.id?{...f,limitation:e.target.value}:f)}}))}/></label>
          <FindingReview f={finding} i={selected} result={record} updateReview={(id,value)=>change(r=>({...r,reviews:{...r.reviews,[id]:value as "accepted"|"rejected"|"investigate"|"unreviewed"}}))} updateFinding={(id,field,value)=>change(r=>field==="note"?{...r,notes:{...r.notes,[id]:value}}:{...r,report:{...r.report,findings:r.report.findings.map(f=>f.id===id?{...f,description:value}:f)}})}/>
          <button type="button" className="secondary" onClick={()=>{change(r=>{const reviews={...r.reviews},notes={...r.notes},edits={...r.edits};delete reviews[finding.id];delete notes[finding.id];delete edits[finding.id];return {...r,reviews,notes,edits,report:{...r.report,findings:r.report.findings.filter(f=>f.id!==finding.id)}};});setSelected(0);}}>Remove observation</button>
        </div>}
        <p className="notice">{manualNotice}</p>
        <div className="manual-actions"><button type="submit" className="primary">{busy?"Please wait…":"Save manual inspection"}</button><button type="button" className="secondary" onClick={download}>Export manual JSON with photographs</button>{record.revision>0&&<button type="button" className="secondary" onClick={remove}>Delete saved inspection</button>}</div>
      </fieldset>:!loading&&<p className="empty-manual">Start with “New manual inspection”. Add photographs and your own observations. No account or API key is needed for browser-local work.</p>}
    </form>
    <h3>Saved manual inspections</h3>
    {!loading&&!records.length&&<p>No manual inspections saved yet.</p>}
    <div className="records">{records.map(({inspection})=><button className="record" key={inspection.id} disabled={busy} onClick={()=>void reopen(inspection.id)}><span>Manual · human-authored</span><strong>{inspection.question}</strong><small>{inspection.report.findings.length} observations · {inspection.photos.length} photographs</small></button>)}</div>
  </section>;
}
