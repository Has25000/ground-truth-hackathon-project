"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DangerButton } from "./forms";
import { OPTIONAL_COLS, REQUIRED_COLS, toRows } from "./csv";

type Progress = { total: number; research: number; enrichment: number; matching: number; blurbs: number; failed: number; pending: number };

export type EventAdminData = {
  event: { id: string; name: string; slug: string; pool: "went" | "all"; priceCents: number; sheetFilename: string | null; sheetUploadedAt: string | null };
  community: { id: string; name: string };
  people: { id: string; name: string; role: string; linkedin: string; went: boolean; selfAdded: boolean; sources: string; stage: number; status: string; error: string | null }[];
  matches: { id: string; a: string; b: string; need: string; blurb: string; score: number; toA: string; toB: string; evidence: { fact: string; source_url: string | null }[] }[];
  progress: Progress;
  unlocks: number;
  intros: number;
};

type Tab = "setup" | "people" | "matches";
const first = (n: string) => n.split(" ")[0];
const STAGE_LABEL = ["Searching the web", "Reading LinkedIn", "Enriching", "Matching", "Writing blurbs", "Matched"];

export function EventAdmin({ data }: { data: EventAdminData }) {
  const router = useRouter();
  const { event } = data;
  const [tab, setTab] = useState<Tab>("setup");
  const [name, setName] = useState(event.name);
  const [slug, setSlug] = useState(event.slug);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(data.progress);
  const [running, setRunning] = useState(false);
  const runRef = useRef(false);

  const went = data.people.filter((p) => p.went || p.selfAdded).length;
  const all = data.people.length;

  const patch = async (body: Record<string, string>) => {
    const res = await fetch(`/api/admin/events/${event.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setSaveMsg(j.error ?? "Couldn't save.");
    setSaveMsg("Saved.");
    router.refresh();
  };

  const run = async () => {
    if (runRef.current) return;
    runRef.current = true;
    setRunning(true);
    let start = true;
    try {
      while (runRef.current) {
        const res = await fetch(`/api/admin/events/${event.id}/run${start ? "?start=1" : ""}`, { method: "POST" });
        start = false;
        if (!res.ok) break;
        const p = (await res.json()) as Progress;
        setProgress(p);
        if (!p.pending) break;
      }
    } finally {
      runRef.current = false;
      setRunning(false);
      router.refresh();
    }
  };

  const redoAll = async () => {
    if (running) return;
    if (!window.confirm(`Redo research for all ${progress.total} people in the pool? Their stored research, profiles and matches are replaced. Paid unlocks are kept.`)) return;
    setRunning(true);
    const res = await fetch(`/api/admin/events/${event.id}/reset`, { method: "POST" });
    setRunning(false);
    if (!res.ok) return;
    setProgress((await res.json()) as Progress);
    run();
  };

  useEffect(() => () => void (runRef.current = false), []);

  return (
    <main className="admin-main">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="crumbs">
            <Link href="/admin">Communities</Link><span>/</span><Link href={`/admin/communities/${data.community.id}`}>{data.community.name}</Link><span>/</span>
          </div>
          <h1 style={{ margin: 0, fontWeight: 600, fontSize: 44, lineHeight: 1, letterSpacing: "-0.045em" }}>{event.name}</h1>
          <div style={{ fontSize: 14 }} className="muted">
            Event page: <Link href={`/e/${event.slug}`} target="_blank">/e/{event.slug}</Link>
            {"  ·  "}{data.unlocks} paid unlocks · {data.intros} intro requests
          </div>
        </div>
        <div className="seg filled tall">
          {(["setup", "people", "matches"] as const).map((t) => (
            <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {tab === "setup" && (
        <div className="setup-grid">
          <div className="card">
            <div className="admin-eyebrow">01 · Event</div>
            <label className="admin-label">
              Name
              <input className="admin-input" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="admin-label">
              Page link
              <div className="slug-box">
                <span>/e/</span>
                <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} aria-label="Page slug" />
              </div>
            </label>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button className="btn-dark" onClick={() => patch({ name, slug })} disabled={name === event.name && slug === event.slug}>Save</button>
              {saveMsg && <span className="muted" style={{ fontSize: 13 }}>{saveMsg}</span>}
            </div>
          </div>

          <SheetCard eventId={event.id} filename={event.sheetFilename} uploadedAt={event.sheetUploadedAt} count={all} onDone={() => router.refresh()} />

          <div className="card" style={{ gap: 12 }}>
            <div className="admin-eyebrow">03 · Who gets matched</div>
            {(
              [
                ["went", "Only people who went", "Rows where went = yes, plus people who added themselves", went],
                ["all", "Everyone in the sheet", "Includes no-shows", all],
              ] as const
            ).map(([k, label, sub, count]) => (
              <button key={k} className="radio-card" onClick={() => k !== event.pool && patch({ pool: k })} role="radio" aria-checked={event.pool === k}>
                <span className={`radio ${event.pool === k ? "on" : ""}`} />
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: 500 }}>{label}</span>
                  <span style={{ fontSize: 13 }} className="muted">{sub}</span>
                </span>
                <span className="mono" style={{ fontSize: 13 }}>{count}</span>
              </button>
            ))}
          </div>

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div className="admin-eyebrow">04 · Pipeline</div>
              <div style={{ fontSize: 13, whiteSpace: "nowrap" }} className="muted">{progress.total} people in pool</div>
            </div>
            {(
              [
                ["research", "Research", "You.com + Firecrawl"],
                ["enrichment", "Enrichment", "Agent 2"],
                ["matching", "Matching", "Agent 3 · Jev"],
                ["blurbs", "Blurbs", "Top 3 per person"],
              ] as const
            ).map(([k, label, tool]) => {
              const n = progress[k];
              const pct = progress.total ? Math.round((n / progress.total) * 100) : 0;
              return (
                <div key={k} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 14 }}>
                    <span><span style={{ fontWeight: 500 }}>{label}</span> <span className="muted">{tool}</span></span>
                    <span className="mono" style={{ fontSize: 12, color: "var(--text-3)", whiteSpace: "nowrap" }}>{n} / {progress.total}</span>
                  </div>
                  <div className="bar"><div style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
            {progress.failed > 0 && <div className="error-text">{progress.failed} failed after retries — running again retries them.</div>}
            <button className="btn-blue" style={{ padding: 12, fontSize: 14, marginTop: 4 }} onClick={run} disabled={running || !all}>
              {running ? "Running… keep this tab open" : "Run for new and failed people"}
            </button>
            {running ? (
              <button className="btn-text" style={{ fontSize: 13 }} onClick={() => (runRef.current = false)}>Pause after this batch</button>
            ) : (
              <button className="btn-ghost" style={{ alignSelf: "center" }} onClick={redoAll} disabled={!progress.total}>Redo research for everyone</button>
            )}
          </div>
        </div>
      )}

      {tab === "people" && (
        <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 14 }}>
            {progress.blurbs} of {progress.total} matched{progress.failed ? ` · ${progress.failed} failed` : ""}{running ? " · running…" : ""}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-ghost" onClick={run} disabled={running || !progress.pending && !progress.failed}>Retry unfinished</button>
            <button className="btn-dark" onClick={redoAll} disabled={running || !progress.total}>Redo research for everyone</button>
          </div>
        </div>
        <div className="table-wrap">
          <div style={{ minWidth: 760 }}>
            <div className="trow head">
              <span>Name</span><span>LinkedIn</span><span>Went</span><span>Researched with</span><span>Status</span>
            </div>
            {data.people.length === 0 && <div style={{ padding: "16px 20px" }} className="muted">Upload a sheet to add people.</div>}
            {data.people.map((p) => (
              <div key={p.id} className="trow">
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: 500 }}>{p.name}</span>
                  <span style={{ fontSize: 12 }} className="muted">{p.role}{p.selfAdded ? " · added themselves" : ""}</span>
                </span>
                {p.linkedin ? (
                  <a className="truncate" style={{ color: "var(--text-3)" }} href={`https://${p.linkedin}`} target="_blank" rel="noopener noreferrer">{p.linkedin}</a>
                ) : <span className="muted">—</span>}
                <span>{p.went ? "Yes" : "No"}</span>
                <span style={{ color: "var(--text-3)" }}>{p.sources}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }} title={p.error ?? undefined}>
                  <span
                    className="sdot"
                    style={
                      p.status === "done" ? { background: "var(--blue)" }
                        : p.status === "failed" ? { background: "#d92d20" }
                          : p.status === "none" ? { border: "1.5px solid #9A9A9A" }
                            : { background: "#9DB4FA" }
                    }
                  />
                  <span>
                    {p.status === "none" ? "Not in pool" : p.status === "failed" ? "Failed" : p.status === "done" ? "Matched" : STAGE_LABEL[p.stage] ?? "Queued"}
                    {p.status !== "done" && p.status !== "none" && p.sources === "Sheet only" && p.stage >= 2 ? " · page blocked, used sheet" : ""}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
        </>
      )}

      {tab === "matches" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {data.matches.length === 0 && <div className="muted">No matches yet. Run the pipeline from Setup.</div>}
          {data.matches.map((x) => (
            <div key={x.id} className="card" style={{ gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 600, fontSize: 26, letterSpacing: "-0.035em", lineHeight: 1.1 }}>
                  {x.a} <span style={{ color: "#A0A0A0" }}>&amp;</span> {x.b}
                </div>
                <div className="score-pill">Score {x.score.toFixed(2)}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 12 }}>
                <div className="benefit-box"><div className="admin-eyebrow">Benefit to {first(x.a)}</div><div>{x.toA}</div></div>
                <div className="benefit-box"><div className="admin-eyebrow">Benefit to {first(x.b)}</div><div>{x.toB}</div></div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="admin-eyebrow grey">Blurb {first(x.a)} sees · helps with {x.need}</div>
                <div className="serif" style={{ fontSize: 18, lineHeight: 1.45, color: "var(--text-1)" }}>“{x.blurb}”</div>
              </div>
              {x.evidence.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--soft-3)", paddingTop: 12 }}>
                  <div className="admin-eyebrow grey">Evidence</div>
                  {x.evidence.map((e) => (
                    <div key={e.fact} style={{ display: "flex", gap: 10, fontSize: 14, flexWrap: "wrap" }}>
                      <span style={{ color: "var(--text-1)" }}>{e.fact}</span>
                      {e.source_url?.startsWith("http") ? (
                        <a href={e.source_url} target="_blank" rel="noopener noreferrer" className="mono" style={{ fontSize: 12 }}>{new URL(e.source_url).hostname}</a>
                      ) : e.source_url ? <span className="mono muted" style={{ fontSize: 12 }}>{e.source_url}</span> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div><DangerButton action={`/api/admin/events/${event.id}`} label="Delete event" confirmText={`Delete ${event.name} and everyone in it? This can't be undone.`} then={`/admin/communities/${data.community.id}`} /></div>
    </main>
  );
}

function SheetCard(props: { eventId: string; filename: string | null; uploadedAt: string | null; count: number; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<string[] | null>(null);

  const load = async (file?: File | null) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) return setError("Upload a .csv file.");
    const { rows, columns, missing } = toRows(await file.text());
    setColumns(columns);
    if (missing.includes("name")) return setError("The sheet needs a name column.");
    if (props.count && !window.confirm(`Replace the ${props.count} people from the current sheet with ${rows.length} from ${file.name}? Their research and matches will be redone.`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/events/${props.eventId}/sheet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, rows }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Upload failed.");
    props.onDone();
  };

  const when = props.uploadedAt ? new Date(props.uploadedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
  const shown = columns ?? (props.filename ? [...REQUIRED_COLS, ...OPTIONAL_COLS] : []);

  return (
    <div className="card">
      <div className="admin-eyebrow">02 · People sheet</div>
      <div
        className={`dropzone ${drag ? "drag" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); load(e.dataTransfer.files[0]); }}
      >
        <div className="csv-icon">CSV</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="truncate" style={{ fontWeight: 500 }}>{busy ? "Uploading…" : props.filename ?? "Drop a CSV here"}</div>
          <div style={{ fontSize: 13 }} className="muted">
            {props.filename ? `${props.count} people · uploaded ${when}` : "Columns: name, linkedin_url, went (yes/no). Optional: role, bio, skills."}
          </div>
        </div>
        <button className="btn-ghost" onClick={() => input.current?.click()} disabled={busy}>{props.filename ? "Replace" : "Choose file"}</button>
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => { load(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {error && <div className="error-text">{error}</div>}
      {shown.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13 }} className="muted">Columns found</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {REQUIRED_COLS.map((c) => (shown.includes(c) ? <span key={c} className="col-chip ok">{c} ✓</span> : <span key={c} className="col-chip missing">{c} missing</span>))}
            {shown.filter((c) => !(REQUIRED_COLS as readonly string[]).includes(c)).map((c) => <span key={c} className="col-chip">{c}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}
