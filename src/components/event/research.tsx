"use client";

import { RESEARCH_STAGES } from "@/lib/stages";

export function Research(props: { firstName: string; stage: number; poolCount: number; failed: boolean; onBack: () => void }) {
  return (
    <section className="col" style={{ maxWidth: 620, gap: 22 }}>
      <div className="eyebrow">Adding you to the event</div>
      <h1 className="h1">Getting to know {props.firstName}.</h1>
      <StageList
        stages={RESEARCH_STAGES.map((s) => ({ ...s, detail: s.detail.replace("{pool}", props.poolCount ? String(props.poolCount) : "everyone") }))}
        stage={props.stage}
      />
      {props.failed ? (
        <div style={{ fontSize: 14 }} className="muted">
          This is taking longer than usual. We&apos;re retrying — keep this page open, or{" "}
          <button className="btn-text" style={{ textDecoration: "underline" }} onClick={props.onBack}>start over</button>.
        </div>
      ) : (
        <div style={{ fontSize: 14 }} className="muted">This usually takes under a minute. Keep this page open.</div>
      )}
    </section>
  );
}

export function StageList({ stages, stage }: { stages: { label: string; detail: string }[]; stage: number }) {
  return (
    <div className="stages" aria-live="polite">
      {stages.map((s, i) => {
        const state = i < stage ? "done" : i === stage ? "running" : "queued";
        return (
          <div key={s.label} className="stage-row">
            {state === "done" && <div className="dot-done">✓</div>}
            {state === "running" && <div className="dot-running" />}
            {state === "queued" && <div className="dot-queued" />}
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <div style={{ fontWeight: 500 }}>{s.label}</div>
              <div style={{ fontSize: 13 }} className="muted">{s.detail}</div>
            </div>
            <div className="stage-status">{state === "done" ? "Done" : state === "running" ? "Running" : "Queued"}</div>
          </div>
        );
      })}
    </div>
  );
}
