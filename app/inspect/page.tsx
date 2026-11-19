import type { Metadata } from "next";
import { InspectionIntro } from "../components/InspectionIntro";
import { ManualWorkspace } from "../components/ManualWorkspace";
import { SiteHeader } from "../components/SiteHeader";
import { SiteFooter } from "../components/SiteFooter";

export const metadata: Metadata = {
  title: "Inspection workspace — SiteWitness",
  description: "Create an inspection, add photographs, request labeled AI suggestions, review them, and print a report.",
};

export default function Page() {
  return <main className="site">
    <SiteHeader />
    <InspectionIntro />
    <ManualWorkspace />
    <SiteFooter />
  </main>;
}
