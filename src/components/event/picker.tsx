"use client";

// Not in the design: shown when a name matches more than one attendee.
export function Picker(props: {
  candidates: { id: string; name: string; role: string }[];
  onPick: (id: string) => void;
  onBack: () => void;
}) {
  return (
    <section className="col" style={{ maxWidth: 560, gap: 20 }}>
      <div className="eyebrow">A few people match</div>
      <h1 className="h1">Which one is you?</h1>
      <div className="stages">
        {props.candidates.map((c) => (
          <button
            key={c.id}
            onClick={() => props.onPick(c.id)}
            className="stage-row"
            style={{ border: 0, borderBottom: "1px solid var(--line-1)", background: "transparent", textAlign: "left", font: "inherit", color: "inherit" }}
          >
            <span className="dot-queued" />
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontWeight: 500 }}>{c.name}</span>
              <span style={{ fontSize: 13 }} className="muted">{c.role}</span>
            </span>
            <span className="stage-status">That&apos;s me →</span>
          </button>
        ))}
      </div>
      <button className="btn-text" style={{ alignSelf: "flex-start" }} onClick={props.onBack}>← Back</button>
    </section>
  );
}
