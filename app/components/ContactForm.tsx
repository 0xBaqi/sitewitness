"use client";
import { useState } from "react";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

export function ContactForm() {
  const [state, setState] = useState<State>({ kind: "idle" });
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Message could not be sent.");
      form.reset();
      setState({ kind: "sent" });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Message could not be sent." });
    }
  }
  if (state.kind === "sent") return <div className="contact-sent" role="status"><h2>Message sent</h2><p>Thanks — you'll get a reply at the address you gave.</p><button className="secondary" type="button" onClick={() => setState({ kind: "idle" })}>Send another</button></div>;
  const busy = state.kind === "sending";
  return <form className="contact-form" onSubmit={submit} noValidate={false}>
    <label>Your name<input name="name" required maxLength={120} autoComplete="name" disabled={busy} /></label>
    <label>Email<input name="email" type="email" required maxLength={200} autoComplete="email" disabled={busy} /></label>
    <label>What is this about?
      <select name="topic" defaultValue="feedback" disabled={busy}>
        <option value="feedback">Feedback or question</option>
        <option value="bug">Something isn't working</option>
        <option value="collaboration">Collaboration or work</option>
        <option value="other">Something else</option>
      </select>
    </label>
    <label>Message<textarea name="message" required minLength={10} maxLength={4000} rows={7} disabled={busy} /></label>
    <div className="hp" aria-hidden="true"><label>Leave this empty<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    {state.kind === "error" && <p className="error" role="alert">{state.message}</p>}
    <button className="primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Send message"}</button>
    <p className="hint">Your message goes to the maker by email. Please don't include inspection photographs or confidential site details.</p>
  </form>;
}
