import { InspectionIntro } from "./components/InspectionIntro";
import { ManualWorkspace } from "./components/ManualWorkspace";

export default function Page() {
  return <main>
    <header className="top experience-top"><a className="brand" href="/"><span className="mark">SW</span><span>SiteWitness</span></a></header>
    <InspectionIntro />
    <ManualWorkspace />
    <footer>Preliminary visual suggestions require professional verification. They are not engineering certification.</footer>
  </main>;
}
