import { captured } from "../../lib/captured";

export function InspectionIntro({ onExplore, disabled = false }: { onExplore?: () => void; disabled?: boolean }) {
  return <section className="inspection-intro" aria-label="AI inspection overview">
    <div className="experience-heading">
      <div><p className="eyebrow">CONSTRUCTION INTELLIGENCE / HUMAN JUDGEMENT</p><h1>From site photo<br/>to <em>reviewable evidence.</em></h1><p className="lead">See what Meta AI observed. Check the evidence, make your call, and keep a record.</p></div>
      <div className="intro-actions">{onExplore ? <button className="primary" disabled={disabled} onClick={onExplore}>Explore AI inspection <span aria-hidden="true">↗</span></button> : <a className="primary" href="/evidence?sample=1">Explore AI inspection <span aria-hidden="true">↗</span></a>}<a className="manual-link" href="/#manual">Start a manual inspection →</a></div>
    </div>
    <p className="capture-caption"><span className="capture-dot" aria-hidden="true"/> Previously generated real Meta AI report; new live analysis disabled.</p>
    <div className="inspection-preview">
      <figure className="preview-photo"><div className="workspace-label"><span>01 / SOURCE PHOTOGRAPH</span><span>800 × 600</span></div><img src="/evidence/captured-construction.jpg" width={800} height={600} alt="Construction site with timber column formwork, diagonal props and exposed reinforcement"/><figcaption>One photograph. Four preliminary observations.<span>Original photograph · no generated overlays</span></figcaption></figure>
      <section className="preview-findings" aria-label="Genuine captured findings"><div className="workspace-label"><span>META / MUSE SPARK 1.3</span><span>CAPTURED REPORT</span></div><h2>What the AI saw</h2><ol>{captured.report.findings.map((f,i)=><li key={f.id}><span className="finding-number">0{i+1}</span><div><h3>{f.title}</h3><p>{f.evidence}</p></div></li>)}</ol><div className="preview-review"><strong>Human review comes next</strong><p>Accept, reject or investigate. Original AI text stays separate from your decisions.</p></div></section>
    </div>
    <details className="intro-questions"><summary>3 follow-up questions · evidence still needed</summary><ol>{captured.report.unanswered_questions.map(q=><li key={q}>{q}</li>)}</ol></details>
    <p className="hint">Preliminary observations, not established defects or engineering certification. Some details need qualification during review.</p>
  </section>;
}
