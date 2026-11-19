// Public site configuration. Nothing here is a credential.
// NEXT_PUBLIC_CONTACT_EMAIL is optional: when unset, no email address is shown
// and visitors are pointed to the contact form, X and GitHub instead.
export const site = {
  name: "SiteWitness",
  tagline: "Field evidence review for construction inspections",
  description:
    "Record site details, observations and photographs in one inspection, get labeled AI suggestions, review every one yourself, and print a report with full provenance.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://sitewitness.vercel.app",
  maker: { name: "Baronal Labs", handle: "@0xBaqi" },
  links: {
    x: "https://x.com/0xBaqi",
    github: "https://github.com/0xBaqi/sitewitness",
  },
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "",
} as const;

export const nav = [
  { href: "/#how", label: "How it works" },
  { href: "/#limits", label: "Limits" },
  { href: "/#faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
] as const;
