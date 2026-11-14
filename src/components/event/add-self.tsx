"use client";

export function AddSelf(props: {
  name: string;
  setName: (v: string) => void;
  linkedin: string;
  setLinkedin: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <section className="col" style={{ maxWidth: 560, gap: 20 }}>
      <div className="eyebrow">Not on the list yet</div>
      <h1 className="h1">We don&apos;t have you yet.</h1>
      <p className="lead">
        Add your name and LinkedIn. We&apos;ll research you, add you to this event, and find your matches. It takes about a
        minute.
      </p>
      <form
        style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 4 }}
        onSubmit={(e) => {
          e.preventDefault();
          props.onSubmit();
        }}
      >
        <label className="field">
          Full name
          <input value={props.name} onChange={(e) => props.setName(e.target.value)} required autoComplete="name" />
        </label>
        <label className="field">
          LinkedIn URL
          <input
            value={props.linkedin}
            onChange={(e) => props.setLinkedin(e.target.value)}
            placeholder="linkedin.com/in/yourname"
            inputMode="url"
            autoComplete="url"
          />
        </label>
        {props.error && <div style={{ fontSize: 14, color: "#b42318" }}>{props.error}</div>}
        <button type="submit" className="btn-blue" style={{ marginTop: 6 }} disabled={props.loading}>
          {props.loading ? "Adding…" : "Add me to the event"}
        </button>
      </form>
      <button className="btn-text" style={{ alignSelf: "flex-start" }} onClick={props.onBack}>← Back</button>
    </section>
  );
}
