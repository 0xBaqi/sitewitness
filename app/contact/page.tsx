import type { Metadata } from "next";
import { SiteHeader } from "../components/SiteHeader";
import { SiteFooter } from "../components/SiteFooter";
import { ContactForm } from "../components/ContactForm";
import { ContactLinks } from "../components/ContactLinks";

export const metadata: Metadata = {
  title: "Contact — SiteWitness",
  description: "Send feedback, report a problem, or get in touch about SiteWitness.",
};

export default function ContactPage() {
  return <main className="site">
    <SiteHeader />
    <section className="contact-grid">
      <div>
        <p className="eyebrow">CONTACT</p>
        <h1>Talk to the person<br /><em>who built it.</em></h1>
        <p className="lead">Feedback, a bug, a question about how a report is produced, or interest in working together — send a note and expect a reply.</p>
        <h2 className="small-h">Or reach out directly</h2>
        <ContactLinks />
      </div>
      <div className="panel"><ContactForm /></div>
    </section>
    <SiteFooter />
  </main>;
}
