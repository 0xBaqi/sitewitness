import Link from "next/link";
import { captured } from "../../lib/captured";

export function InspectionIntro() {
  return <section className="inspection-intro" aria-label="AI inspection overview">
    <div className="experience-heading"><div><p className="eyebrow">SITEWITNESS / HUMAN REVIEW WITH AI SUPPORT</p><h1>One inspection.<br/><em>Clearer evidence.</em></h1><p className="lead">Record the site details, your observations and photographs together. Ask Meta Muse Spark for additional visual suggestions, then review, edit, save and export one report.</p></div></div>
    <p className="capture-caption">Your photographs and the inspection context are sent to Meta only when you choose Analyze. Every AI suggestion is labeled and remains subject to your review.</p>
    <details className="intro-questions"><summary>Optional example · previously generated Meta report</summary><p>{captured.report.overview}</p><ol>{captured.report.findings.map(f=><li key={f.id}><strong>{f.title}</strong> — {f.evidence}</li>)}</ol><p><Link href="/evidence?sample=1">Open and review the labeled captured example →</Link></p><p className="hint">This is a saved example, not new analysis. It is not used as a first-run result.</p></details>
  </section>;
}
