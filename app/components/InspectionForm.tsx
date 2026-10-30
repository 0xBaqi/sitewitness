import type { FormEvent } from "react";
type Props = {
  preview: string;
  question: string;
  setQuestion: (value: string) => void;
  access: string;
  setAccess: (value: string) => void;
  busy: boolean;
  error: string;
  photo: File | null;
  setPhoto: (value: File | null) => void;
  analyze: (event: FormEvent) => void;
};
export function InspectionForm({
  preview,
  question,
  setQuestion,
  access,
  setAccess,
  busy,
  error,
  photo,
  setPhoto,
  analyze,
}: Props) {
  return (
    <section className="panel">
      <div className="panelhead">
        <span className="num">01</span>
        <h2>New inspection</h2>
      </div>
      <form onSubmit={analyze}>
        <label className="upload">
          {preview ? (
            <img src={preview} alt="Selected inspection photograph" />
          ) : (
            <div className="empty">
              <span className="plus">+</span>
              <strong>Choose a site photograph</strong>
              <small>JPEG / PNG / WebP · max 4 MB</small>
            </div>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setPhoto(e.target.files?.[0] || null)}
            required
          />
        </label>
        <label>
          Inspection question
          <textarea
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={500}
          />
        </label>
        <label>
          Deployment access code
          <input
            type="password"
            value={access}
            onChange={(e) => setAccess(e.target.value)}
            placeholder="Provided by site owner"
            autoComplete="off"
            required
          />
        </label>
        <button type="submit" disabled={busy || !photo || !access}>
          {busy ? "Analyzing photograph…" : "Analyze real photograph"}{" "}
          <span>↗</span>
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="hint">
          Powered by Muse Spark 1.3. This first slice does not perform SAM
          segmentation or image-region linking. Images are sent to Meta for
          analysis and retained locally in this browser.
        </p>
      </form>
    </section>
  );
}
