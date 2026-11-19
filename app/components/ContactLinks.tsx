import { site } from "../../lib/site";

export function ContactLinks() {
  return <ul className="contact-links">
    {site.email && <li><span>Email</span><a href={`mailto:${site.email}`}>{site.email}</a></li>}
    <li><span>X</span><a href={site.links.x} rel="noreferrer">{site.maker.handle}</a></li>
    <li><span>GitHub</span><a href={site.links.github} rel="noreferrer">0xBaqi/sitewitness</a></li>
  </ul>;
}
