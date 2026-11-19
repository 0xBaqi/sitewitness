import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "./components/SiteHeader";
import { SiteFooter } from "./components/SiteFooter";
import { ContactLinks } from "./components/ContactLinks";
import { captured } from "../lib/captured";
import { site } from "../lib/site";

export const metadata: Metadata = {
  title: `${site.name} — ${site.tagline}`,
  description: site.description,
};

const steps = [
  ["01", "Record the inspection", "Site, location, the question you are asking, your own summary and observations. Your words come first and stay labeled as yours."],
  ["02", "Add photographs", "Up to five JPEG, PNG or WebP photos, 4 MB combined. Each is fingerprinted with a SHA-256 hash so the report can prove which images were analyzed."],
  ["03", "Ask for AI suggestions", "Only when you choose Analyze, the photos and inspection context go to Meta Muse Spark 1.3. Nothing is sent before that."],
  ["04", "Review every suggestion", "Accept, reject or mark it to investigate. Edit the wording and add reviewer notes. AI text and human text are never merged."],
  ["05", "Print or export", "A readable report with photos, model and timestamp, photo hashes, findings, your decisions and limitations. Save as PDF, or export JSON as a backup."],
] as const;

const faq = [
  ["Do I need an account?", "No. There is no login, access code or sign-up. Inspections are stored in your own browser."],
  ["Where is my data kept?", "Inspections and photos live in your browser's IndexedDB (up to 25 saved inspections). They are not encrypted by SiteWitness and do not sync across browsers or devices, so export a JSON backup before clearing browser data. Photos reach a server only when you press Analyze."],
  ["Which AI model is used, and is it reliable?", "Meta Muse Spark 1.3, called from the server so no credential reaches your browser. It can be incomplete or wrong. Treat every output as a suggestion to compare against the photograph and verify on site."],
  ["Can I use it as an engineering sign-off?", "No. Reports are preliminary visual documentation. Review decisions are self-declared and not authenticated, and a photograph cannot establish concealed, below-grade, measured or compliance conditions."],
  ["Does it mark where a problem is in the photo?", "No. SiteWitness does not do segmentation or provide boxes, masks or pixel localization."],
  ["Why did analysis fail or stop working?", "Analysis depends on a hosted service with abuse throttles and finite daily allowances, so availability is not guaranteed. Manual inspections, review and printing keep working without it."],
] as const;

export default function Home() {
  const first = captured.report.findings.slice(0, 3);
  return <main className="site">
    <SiteHeader />

    <section className="landing-hero">
      <div>
        <p className="eyebrow">SITEWITNESS / HUMAN REVIEW WITH AI SUPPORT</p>
        <h1>Site photos in.<br /><em>Traceable evidence out.</em></h1>
        <p className="lead">SiteWitness keeps one construction inspection together — your observations, the photographs, labeled AI suggestions and your review decisions — then prints a report that shows exactly who said what.</p>
        <div className="cta-row">
          <Link className="primary btn" href="/inspect">Start an inspection</Link>
          <Link className="secondary btn" href="/evidence?sample=1">See a captured example</Link>
        </div>
        <ul className="facts" aria-label="Key facts">
          <li>No account</li><li>Photos stay in your browser until you analyze</li><li>AI is always labeled</li>
        </ul>
      </div>
      <figure className="hero-figure">
        <img src="/evidence/captured-construction.jpg" alt="Construction site with timber column formwork, diagonal props and exposed reinforcement" width={800} height={600} />
        <figcaption>Captured example · previously generated Muse Spark report, not new analysis</figcaption>
      </figure>
    </section>

    <section id="how" className="band">
      <p className="eyebrow">HOW IT WORKS</p>
      <h2>One inspection, five steps</h2>
      <ol className="steps">
        {steps.map(([n, t, d]) => <li key={n}><span className="num">{n}</span><h3>{t}</h3><p>{d}</p></li>)}
      </ol>
    </section>

    <section className="band example">
      <div>
        <p className="eyebrow">WHAT A SUGGESTION LOOKS LIKE</p>
        <h2>Specific, sourced, and still yours to judge</h2>
        <p className="lead small">Each finding names what is visible and the evidence for it. You decide whether it stands.</p>
        <Link className="textlink" href="/evidence?sample=1">Open and review the full example →</Link>
      </div>
      <ol className="findings-preview">
        {first.map((f, i) => <li key={f.id}><span className="num">0{i + 1}</span><div><h3>{f.title}</h3><p>{f.evidence}</p></div></li>)}
        <li className="review-note"><strong>Human review required</strong><p>Accepted · Rejected · Investigate — with your edits and notes kept separate from the AI text.</p></li>
      </ol>
    </section>

    <section id="limits" className="band limits">
      <p className="eyebrow">HONEST LIMITS</p>
      <h2>What SiteWitness is — and is not</h2>
      <div className="two-col">
        <div className="panel"><h3>It is</h3><ul>
          <li>A way to organize photographs, observations and review in one place</li>
          <li>Preliminary visual documentation with full provenance</li>
          <li>A second pair of eyes that must be checked by yours</li>
        </ul></div>
        <div className="panel"><h3>It is not</h3><ul>
          <li>Engineering certification or a safety verdict</li>
          <li>A substitute for drawings or a qualified professional inspection</li>
          <li>Able to see concealed, below-grade or measured conditions</li>
        </ul></div>
      </div>
    </section>

    <section id="faq" className="band">
      <p className="eyebrow">FAQ</p>
      <h2>Questions people ask</h2>
      <div className="faq">
        {faq.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
      </div>
    </section>

    <section className="band contact-cta">
      <div>
        <p className="eyebrow">CONTACT</p>
        <h2>Found a problem or have an idea?</h2>
        <p className="lead small">Feedback shapes what gets built next. Send a message or reach out directly.</p>
        <Link className="primary btn" href="/contact">Send a message</Link>
      </div>
      <ContactLinks />
    </section>

    <SiteFooter />
  </main>;
}
