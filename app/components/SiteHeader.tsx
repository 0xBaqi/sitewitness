import Link from "next/link";
import { nav, site } from "../../lib/site";

export function SiteHeader() {
  return <header className="site-header">
    <Link className="brand" href="/" aria-label={`${site.name} home`}><span className="mark">SW</span><span>{site.name}</span></Link>
    <nav aria-label="Primary">
      {nav.map(n => <Link key={n.href} href={n.href}>{n.label}</Link>)}
      <Link className="nav-cta" href="/inspect">Open workspace</Link>
    </nav>
  </header>;
}
