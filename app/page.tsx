"use client";
import { useEffect, useState, useRef } from "react";
import { savedSchema, type Saved } from "../lib/inspection";
import { reportSchema } from "../lib/schema";
import { savePhoto, loadPhoto } from "../lib/photos";
import { FindingReview } from "./components/FindingReview";
import { InspectionHistory } from "./components/InspectionHistory";
import { InspectionForm } from "./components/InspectionForm";
const key = "sitewitness-inspections-v1";
export default function Page() {
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [question, setQuestion] = useState(
    "What construction elements are visibly present, and what needs further verification?",
  );
  const [access, setAccess] = useState("");
  const [busy, setBusy] = useState(false);
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
  useEffect(() => {
    if (!photo) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
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
  function selectPhoto(file: File | null) {
    setError("");
    if (
      file &&
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ) {
      setPhoto(null);
      setError("Use JPEG, PNG, or WebP.");
      return;
    }
    if (file && (file.size === 0 || file.size > 4 * 1024 * 1024)) {
      setPhoto(null);
      setError("Image must be between 1 byte and 4 MB.");
      return;
    }
    setPhoto(file);
  }
  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    if (!photo || busy) return;
    if (!question.trim()) {
      setError("Enter an inspection question.");
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);
    setBusy(true);
    setError("");
    try {
      const data = new FormData();
      data.append("photo", photo);
      data.append("question", question);
      const response = await fetch("/api/analyze", {
        method: "POST",
        signal: controller.signal,
        headers: { "x-sitewitness-access": access },
        body: data,
      });
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error(
          "The server returned an unreadable response. Try again later.",
        );
      }

      if (!response.ok)
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "Analysis failed",
        );
      const item: Saved = {
        id: crypto.randomUUID(),
        date: payload.timestamp,
        question,
        filename: photo.name,
        report: reportSchema.parse(payload.report),
        reviews: {},
        edits: {},
        notes: {},
      };
      try {
        await savePhoto(item.id, photo);
      } catch {
        setError(
          "Report created, but the photograph could not be retained in this browser.",
        );
      }
      store((items) => [item, ...items]);
      setActiveId(item.id);
    } catch (e) {
      setError(
        controller.signal.aborted
          ? "Analysis timed out. Try again later."
          : e instanceof Error
            ? e.message
            : "Unexpected error",
      );
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
  }
  function updateReview(id: string, value: string) {
    store((items) =>
      items.map((item) =>
        item.id === activeId
          ? { ...item, reviews: { ...item.reviews, [id]: value } }
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
        <p className="eyebrow">ENGINEERING WORKFLOW · META MODEL API</p>
        <h1>
          Observe the site.
          <br />
          <em>Question the evidence.</em>
        </h1>
        <p className="lead">
          Turn field photographs into reviewable observations. AI proposes;
          engineers verify.
        </p>
      </section>
      <div className="shell">
        <InspectionForm
          preview={preview}
          question={question}
          setQuestion={setQuestion}
          access={access}
          setAccess={setAccess}
          busy={busy}
          error={error}
          photo={photo}
          setPhoto={selectPhoto}
          analyze={analyze}
        />
        <section className="panel result">
          <div className="panelhead">
            <span className="num">02</span>
            <h2>Evidence review</h2>
          </div>
          {!result ? (
            <div className="standby" role="status">
              <div className="radar">⌖</div>
              <h3>Awaiting an inspection</h3>
              <p>
                Your analysis and reviewable findings will appear here. Nothing
                is generated until you submit a photo.
              </p>
            </div>
          ) : (
            <div>
              <div className="reporthead">
                <span className="tag">
                  MODEL ANALYSIS · HUMAN REVIEW REQUIRED
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
                  No findings returned. Review the overview and unanswered
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
      <footer>
        SiteWitness / Built for the real world.{" "}
        <span>
          Preliminary observations are not engineering certifications.
        </span>
      </footer>
    </main>
  );
}
