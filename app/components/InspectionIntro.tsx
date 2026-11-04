import Link from "next/link";
import { captured } from "../../lib/captured";

export function InspectionIntro({ onExplore, disabled = false }: { onExplore?: () => void; disabled?: boolean } = {}) {
  return <section className="inspection-intro" aria-label="AI inspection overview">
    <div className="experience-heading"><div><p className="eyebrow">CONSTRUCTION INTELLIGENCE / HUMAN JUDGEMENT</p><h1>From site photo<br/>to <em>reviewable evidence.</em></h1><p className="lead">Upload a construction photograph for live Meta Muse Spark analysis, then check and edit every observation before saving.</p></div>
      <div className="intro-actions">{onExplore ? <button className="primary" disabled={disabled} onClick={onExplore}>Explore captured example <span aria-hidden="true">↗</span></button> : <Link className="primary" href="/live">Analyze a site photograph <span aria-hidden="true">↗</span></Link>}<a className="manual-link" href={onExplore ? "/live" : "#manual"}>{onExplore ? "Analyze a new photograph →" : "Start a manual inspection →"}</a></div>
    </div>
    <p className="capture-caption">Live analysis requires the service to be configured and enabled by its operator. Your photograph is sent to Meta only when you submit an analysis.</p>
    <details className="intro-questions"><summary>Optional example · previously generated Meta report</summary><p>{captured.report.overview}</p><ol>{captured.report.findings.map(f=><li key={f.id}><strong>{f.title}</strong> — {f.evidence}</li>)}</ol><p><Link href="/evidence?sample=1">Open and review the labeled captured example →</Link></p><p className="hint">This is a saved example, not new analysis. It is not used as a first-run result.</p></details>
  </section>;
}
