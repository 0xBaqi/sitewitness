import type { MetadataRoute } from "next";
import { site } from "../lib/site";
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/inspect", "/contact"].map((p) => ({ url: `${site.url}${p}`, changeFrequency: "monthly" as const }));
}
