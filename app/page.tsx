'use client';
import {useEffect,useState} from 'react';
import type {Report} from '../lib/schema';
type Saved={id:string;date:string;question:string;filename:string;report:Report;reviews:Record<string,string>;edits?:Record<string,string>;notes?:Record<string,string>};
const key='sitewitness-inspections-v1';
export default function Page(){
  const [photo,setPhoto]=useState<File|null>(null);const [preview,setPreview]=useState('');const [question,setQuestion]=useState('What construction elements are visibly present, and what needs further verification?');
  const [access,setAccess]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [result,setResult]=useState<Saved|null>(null);const [history,setHistory]=useState<Saved[]>([]);
  useEffect(()=>{try{const h=localStorage.getItem(key);if(h)setHistory(JSON.parse(h))}catch{}},[]);
  useEffect(()=>{if(!photo){setPreview('');return}const url=URL.createObjectURL(photo);setPreview(url);return()=>URL.revokeObjectURL(url)},[photo]);
  const store=(items:Saved[])=>{setHistory(items);try{localStorage.setItem(key,JSON.stringify(items.slice(0,25)))}catch{setError('Could not save in this browser; export the report instead.')}};
  async function analyze(e:React.FormEvent){e.preventDefault();if(!photo)return;setBusy(true);setError('');try{
    const data=new FormData();data.append('photo',photo);data.append('question',question);
    const response=await fetch('/api/analyze',{method:'POST',headers:{'x-sitewitness-access':access},body:data});const payload=await response.json();
    if(!response.ok)throw new Error(payload.error||'Analysis failed');
    const item:Saved={id:crypto.randomUUID(),date:payload.timestamp,question,filename:photo.name,report:payload.report,reviews:{},edits:{},notes:{}};
    setResult(item);store([item,...history].slice(0,25));
  }catch(e){setError(e instanceof Error?e.message:'Unexpected error')}finally{setBusy(false)}}
  function updateReview(id:string,value:string){if(!result)return;const updated={...result,reviews:{...result.reviews,[id]:value}};setResult(updated);store(history.map(x=>x.id===updated.id?updated:x))}
  function updateFinding(id:string,field:'edit'|'note',value:string){
    if(!result)return;
    const updated:Saved=field==='edit'
      ? {...result,edits:{...result.edits,[id]:value}}
      : {...result,notes:{...result.notes,[id]:value}};
    setResult(updated);
    store(history.map(x=>x.id===updated.id?updated:x));
  }
  function exportReport(){if(!result)return;const blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`sitewitness-${result.id.slice(0,8)}.json`;a.click();URL.revokeObjectURL(url)}
  return <main><header className="top"><div className="brand"><span className="mark">SW</span><span>SiteWitness</span></div><span className="tag">FIELD EVIDENCE / ALPHA</span></header><section className="hero"><p className="eyebrow">ENGINEERING WORKFLOW · META MODEL API</p><h1>Observe the site.<br/><em>Question the evidence.</em></h1><p className="lead">Turn field photographs into reviewable observations. AI proposes; engineers verify.</p></section><div className="shell"><section className="panel"><div className="panelhead"><span className="num">01</span><h2>New inspection</h2></div><form onSubmit={analyze}><label className="upload">{preview?<img src={preview} alt="Selected inspection photograph"/>:<div className="empty"><span className="plus">+</span><strong>Choose a site photograph</strong><small>JPEG / PNG / WebP · max 4 MB</small></div>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setPhoto(e.target.files?.[0]||null)} required/></label><label>Inspection question<textarea rows={3} value={question} onChange={e=>setQuestion(e.target.value)} maxLength={500}/></label><label>Deployment access code<input type="password" value={access} onChange={e=>setAccess(e.target.value)} placeholder="Provided by site owner" autoComplete="off" required/></label><button type="submit" disabled={busy||!photo||!access}>{busy?'Analyzing photograph…':'Analyze real photograph'} <span>↗</span></button>{error&&<p className="error" role="alert">{error}</p>}<p className="hint">Powered by Muse Spark 1.3. This first slice does not perform SAM segmentation or image-region linking. Images are sent to Meta for analysis but are not saved in browser history.</p></form></section><section className="panel result"><div className="panelhead"><span className="num">02</span><h2>Evidence review</h2></div>{!result?<div className="standby"><div className="radar">⌖</div><h3>Awaiting an inspection</h3><p>Your analysis and reviewable findings will appear here. Nothing is generated until you submit a photo.</p></div>:<div><div className="reporthead"><span className="tag">MODEL ANALYSIS · HUMAN REVIEW REQUIRED</span><button className="secondary" onClick={exportReport}>Export JSON ↓</button></div><p className="summary">{result.report.overview}</p>{result.report.findings.map((f,i)=><article className="finding" key={f.id+i}><div className="findingtop"><span>{String(i+1).padStart(2,'0')} / {f.category.replaceAll('_',' ')}</span><strong>{f.title}</strong></div><label>Reviewed observation
          <textarea rows={3}
            value={result.edits?.[f.id]??f.description}
            maxLength={1200}
            onChange={e=>updateFinding(f.id,'edit',e.target.value)}
          />
        </label>
        <p><b>Visible evidence:</b> {f.evidence||'Not specified'}</p><p><b>Limitation:</b> {f.limitation||'Requires further review'}</p><label>Reviewer decision<select value={result.reviews[f.id]||'unreviewed'} onChange={e=>updateReview(f.id,e.target.value)}><option value="unreviewed">Not reviewed</option><option value="accepted">Accepted as observation</option><option value="rejected">Rejected / unsupported</option><option value="investigate">Requires further investigation</option></select></label>
        <label>Reviewer notes
          <textarea rows={2}
            placeholder="Explain your decision or record what needs checking."
            value={result.notes?.[f.id]??''}
            maxLength={1000}
            onChange={e=>updateFinding(f.id,'note',e.target.value)}
          />
        </label></article>)}{result.report.unanswered_questions.length>0&&<div className="questions"><strong>Unanswered questions</strong><ul>{result.report.unanswered_questions.map((q,i)=><li key={i}>{q}</li>)}</ul></div>}<p className="notice">{result.report.notice}</p></div>}</section></div><section className="archive"><div className="archivehead"><h2>Inspection history</h2><small>Saved on this browser only · no images retained</small></div>{history.length===0?<p className="muted">No reports yet.</p>:<div className="records">{history.map(h=><button className="record" key={h.id} onClick={()=>{setResult(h);setError('')}}><span>{new Date(h.date).toLocaleString()}</span><strong>{h.filename}</strong><small>{h.report.findings.length} findings →</small></button>)}</div>}<p className="muted">Alpha limitation: browser-local record storage is not secure multi-user persistence. Do not use this version for sensitive or safety-critical records.</p></section><footer>SiteWitness / Built for the real world. <span>Preliminary observations are not engineering certifications.</span></footer></main>
}
