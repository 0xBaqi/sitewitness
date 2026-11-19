import Link from "next/link";
import { site } from "../../lib/site";

export function SiteFooter() {
  return <footer className="site-footer">
    <div>
      <p className="brand-line"><span className="mark">SW</span> {site.name}</p>
      <p>Preliminary visual suggestions require professional verification. They are not engineering certification.</p>
      <p className="muted">Built by {site.maker.name} · <a href={site.links.x} rel="noreferrer">{site.maker.handle}</a></p>
    </div>
    <nav aria-label="Footer">
      <Link href="/inspect">Workspace</Link>
      <Link href="/evidence?sample=1">Captured example</Link>
      <Link href="/contact">Contact</Link>
      <a href={site.links.github} rel="noreferrer">GitHub</a>
      <a href={site.links.x} rel="noreferrer">X</a>
    </nav>
  </footer>;
}
