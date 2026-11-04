import type { Finding } from "../../lib/schema";
import type { Saved } from "../../lib/inspection";
type Props = {
  f: Finding;
  i: number;
  result: Saved;
  aiSuggestion?: boolean;
  updateReview: (id: string, value: string) => void;
  updateFinding: (id: string, field: "edit" | "note", value: string) => void;
};
export function FindingReview({
  f,
  i,
  result,
  aiSuggestion = false,
  updateReview,
  updateFinding,
}: Props) {
  return (
    <article className="finding">
      <div className="findingtop">
        <span>
          {String(i + 1).padStart(2, "0")} / {f.category.replaceAll("_", " ")}
        </span>
        <strong>{f.title}</strong>
      </div>
      <label>
        {aiSuggestion ? "Human reviewed suggestion" : result.provenance.kind === "manual" ? "Observation description" : "Reviewed observation"}
        <textarea
          required={result.provenance.kind === "manual"}
          rows={3}
          value={result.edits?.[f.id] ?? f.description}
          maxLength={1200}
          onChange={(e) => updateFinding(f.id, "edit", e.target.value)}
        />
      </label>
      <p>
        <b>Visible evidence:</b> {f.evidence || "Not specified"}
      </p>
      <p>
        <b>Limitation:</b> {f.limitation || "Requires further review"}
      </p>
      <label>
        Reviewer decision
        <select
          value={result.reviews[f.id] || "unreviewed"}
          onChange={(e) => updateReview(f.id, e.target.value)}
        >
          <option value="unreviewed">Not reviewed</option>
          <option value="accepted">Accepted as observation</option>
          <option value="rejected">Rejected / unsupported</option>
          <option value="investigate">Requires further investigation</option>
        </select>
      </label>
      <label>
        Reviewer notes
        <textarea
          rows={2}
          placeholder="Explain your decision or record what needs checking."
          value={result.notes?.[f.id] ?? ""}
          maxLength={1000}
          onChange={(e) => updateFinding(f.id, "note", e.target.value)}
        />
      </label>
    </article>
  );
}
