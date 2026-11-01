"use client";
import { useEffect, useState, useRef } from "react";
import { savedSchema, provenanceLabel, type Saved } from "../lib/inspection";
import { loadPhoto } from "../lib/photos";
import { FindingReview } from "./components/FindingReview";
import { InspectionHistory } from "./components/InspectionHistory";
import { ManualWorkspace } from "./components/ManualWorkspace";
const key = "sitewitness-inspections-v1";
export default function Page() {
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [history, setHistory] = useState<Saved[]>([]);
  const historyRef = useRef<Saved[]>([]);
  const result = history.find((item) => item.id === activeId) ?? null;
  const [selected, setSelected] = useState(0);
  const [evidence, setEvidence] = useState("");
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [imageStatus, setImageStatus] = useState("");
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error("Invalid history");
        const valid = parsed.map((item) => savedSchema.safeParse(item));
        const items = valid
          .flatMap((item) => (item.success ? [item.data] : []))
          .slice(0, 25);
        if (valid.some((item) => !item.success))
          setError(
            "Some saved inspections were invalid and could not be loaded.",
          );
        historyRef.current = items;
        setHistory(items);
        setActiveId(items[0]?.id ?? null);
      }
    } catch {
      setError("Saved history could not be read.");
    }
  }, []);
  useEffect(() => {
    setSelected(0);
    setEvidence("");
    if (!activeId) {
      setImageStatus("");
      return;
    }
    let cancelled = false;
    let url = "";
    setImageStatus("Loading photograph…");
    loadPhoto(activeId)
      .then((blob) => {
        if (cancelled) return;
        if (blob) {
          url = URL.createObjectURL(blob);
          setEvidence(url);
          setEvidenceId(activeId);
          setImageStatus("");
        } else
          setImageStatus(
            "No retained photograph is available for this inspection.",
          );
      })
      .catch(() => {
        if (!cancelled)
          setImageStatus("The saved photograph could not be loaded.");
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [activeId]);
  const store = (change: (items: Saved[]) => Saved[]) => {
    const updated = change(historyRef.current).slice(0, 25);
    historyRef.current = updated;
    setHistory(updated);
    try {
      localStorage.setItem(key, JSON.stringify(updated));
    } catch {
      setError("Could not save in this browser; export the report instead.");
    }
  };
  function updateReview(id: string, value: string) {
    store((items) =>
      items.map((item) =>
        item.id === activeId
          ? { ...item, reviews: { ...item.reviews, [id]: value as Saved["reviews"][string] } }
          : item,
      ),
    );
  }
  function updateFinding(id: string, field: "edit" | "note", value: string) {
    const property = field === "edit" ? "edits" : "notes";
    store((items) =>
      items.map((item) =>
        item.id === activeId
          ? { ...item, [property]: { ...item[property], [id]: value } }
          : item,
      ),
    );
  }
  function exportReport() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sitewitness-${result.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <main>
      <header className="top">
        <div className="brand">
          <span className="mark">SW</span>
          <span>SiteWitness</span>
        </div>
        <span className="tag">FIELD EVIDENCE / ALPHA</span>
      </header>
      <section className="hero">
        <p className="eyebrow">FIELD PHOTOGRAPHS · HUMAN OBSERVATIONS</p>
        <h1>
          Observe the site.
          <br />
          <em>Question the evidence.</em>
        </h1>
        <p className="lead">
          Record what you see. Add photographs, write observations, and keep a
          reviewable inspection record — no AI access required.
        </p>
      </section>
      <ManualWorkspace legacyError={error} />
      <section hidden={!history.length && !error} aria-label="Previous inspections">
      <div className="legacy-workspace">
        <section className="panel result">
          <div className="panelhead">
            <span className="num">02</span>
            <h2>Previous inspection review</h2>
          </div>
          {!result ? (
            <div className="standby" role="status">
              <div className="radar">⌖</div>
              <h3>Awaiting an inspection</h3>
              <p>
                Previously saved records appear here. Start a manual inspection
                above to create a new record. AI analysis is unavailable.
              </p>
            </div>
          ) : (
            <div>
              <div className="reporthead">
                <span className="tag">
                  {provenanceLabel(result.provenance)}
                </span>
                <button className="secondary" onClick={exportReport}>
                  Export JSON ↓
                </button>
              </div>
              <p className="summary">{result.report.overview}</p>
              <div className="evidence-photo">
                {evidence && evidenceId === activeId ? (
                  <img
                    src={evidence}
                    alt={`Inspection photograph: ${result.filename}`}
                  />
                ) : (
                  <p className="muted" role="status">
                    {imageStatus}
                  </p>
                )}
              </div>
              {result.report.findings.length === 0 && (
                <p role="status">
                  No recorded findings. Review the overview and unanswered
                  questions.
                </p>
              )}
              <nav className="finding-selector" aria-label="Select finding">
                {result.report.findings.map((f, i) => (
                  <button
                    type="button"
                    className="secondary"
                    aria-pressed={selected === i}
                    key={f.id + i}
                    onClick={() => setSelected(i)}
                  >
                    {String(i + 1).padStart(2, "0")} / {f.title}
                  </button>
                ))}
              </nav>
              {result.report.findings[selected] && (
                <FindingReview
                  f={result.report.findings[selected]}
                  i={selected}
                  result={result}
                  updateReview={updateReview}
                  updateFinding={updateFinding}
                />
              )}
              {result.report.unanswered_questions.length > 0 && (
                <div className="questions">
                  <strong>Unanswered questions</strong>
                  <ul>
                    {result.report.unanswered_questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="notice">{result.report.notice}</p>
            </div>
          )}
        </section>
      </div>
      <InspectionHistory
        history={history}
        onSelect={(id) => {
          setActiveId(id);
          setError("");
        }}
      />
      </section>
      <footer>
        SiteWitness / Built for the real world.{" "}
        <span>
          Preliminary observations are not engineering certifications.
        </span>
      </footer>
    </main>
  );
}
