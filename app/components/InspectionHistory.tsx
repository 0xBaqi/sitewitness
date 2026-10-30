import type { Saved } from "../../lib/inspection";
export function InspectionHistory({
  history,
  onSelect,
}: {
  history: Saved[];
  onSelect: (id: string) => void;
}) {
  return (
    <section className="archive">
      <div className="archivehead">
        <h2>Inspection history</h2>
        <small>Saved on this browser only · photographs retained locally</small>
      </div>
      {history.length === 0 ? (
        <p className="muted">No reports yet.</p>
      ) : (
        <div className="records">
          {history.map((h) => (
            <button
              className="record"
              key={h.id}
              onClick={() => onSelect(h.id)}
            >
              <span>{new Date(h.date).toLocaleString()}</span>
              <strong>{h.filename}</strong>
              <small>{h.report.findings.length} findings →</small>
            </button>
          ))}
        </div>
      )}
      <p className="muted">
        Alpha limitation: browser-local record storage is not secure multi-user
        persistence. Do not use this version for sensitive or safety-critical
        records.
      </p>
    </section>
  );
}
