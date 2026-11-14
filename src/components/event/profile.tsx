"use client";

import { useEffect, useState } from "react";
import type { Revealed, Teaser, ViewerPayload } from "@/lib/types";
import { formatPrice } from "./price";
import { StageList } from "./research";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const pad = (i: number) => `0${i + 1}`;

const FINDING = [
  { label: "Researching the room", detail: "Reading what everyone here works on and needs" },
  { label: "Scoring matches both ways", detail: "Who helps you, and who you help back" },
  { label: "Writing your introductions", detail: "Why to meet and what to open with" },
];

export function Profile(props: {
  viewer: ViewerPayload;
  priceCents: number;
  finding: boolean;
  onFindingDone: () => void;
  onUnlock: () => void;
  onRequest: (id: string) => void;
  onReset: () => void;
  error: string | null;
}) {
  const { profile, teasers, unlocked, revealed } = props.viewer;
  const href = profile.linkedin ? `https://${profile.linkedin}` : null;
  const n = teasers.length;
  const countWord = ["No one", "One person", "Two people", "Three people"][n] ?? `${n} people`;

  return (
    <div className="col" style={{ maxWidth: 1040, gap: 64 }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div className="eyebrow">Your profile</div>
          <button
            className="btn-text"
            style={{ fontSize: 13, whiteSpace: "nowrap", textDecoration: "underline", textUnderlineOffset: 3 }}
            onClick={props.onReset}
          >
            Not you?
          </button>
        </div>
        <h1 className="h1">You&apos;re {profile.name}.</h1>
        <div className="auto-grid g260">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="eyebrow sm">Bio</div>
            <div style={{ fontSize: 17, fontWeight: 500 }}>{profile.headline}</div>
            <div className="serif" style={{ fontSize: 17, lineHeight: 1.55, color: "var(--text-2)", textWrap: "pretty" }}>
              {profile.background}
            </div>
          </div>
          {href && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="eyebrow sm">This is your LinkedIn</div>
              <a href={href} target="_blank" rel="noopener noreferrer" className="li-row">
                <span className="li-tile">in</span>
                <span className="truncate">{profile.linkedin}</span>
              </a>
              <div style={{ fontSize: 13 }} className="muted">Everything here comes from {profile.sourcesLabel}.</div>
            </div>
          )}
        </div>
      </section>

      {profile.needs.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="eyebrow">What might help you</div>
          <h2 className="h2">Things we think could help you.</h2>
          <div className="num-list">
            {profile.needs.map((need, i) => (
              <div key={need.text} className="num-row">
                <div className="num">{pad(i)}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontSize: 18, fontWeight: 500 }}>{need.text}</div>
                    <span className="guess-pill">Our guess · {pct(need.confidence)}</span>
                  </div>
                  <div style={{ fontSize: 14 }} className="muted">{need.evidence}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {n === 0 ? (
          <>
            <div className="eyebrow">Your introductions</div>
            <h2 className="h2">We&apos;re still matching people here.</h2>
            <p className="lead">Check back in a little while — introductions appear once everyone at the event has been researched.</p>
          </>
        ) : !unlocked ? (
          <Locked teasers={teasers} countWord={countWord} priceCents={props.priceCents} onUnlock={props.onUnlock} error={props.error} />
        ) : props.finding ? (
          <Finding onDone={props.onFindingDone} />
        ) : (
          <>
            <div className="eyebrow">Your introductions · in the room now</div>
            <h2 className="h2">{countWord} here who could help.</h2>
            <div className="match-grid">
              {revealed.map((r) => (
                <RevealedCard key={r.id} r={r} onRequest={() => props.onRequest(r.id)} />
              ))}
            </div>
            <div style={{ fontSize: 14 }} className="muted">
              Each person is matched because you both gain something. Full names and contact details stay private until they say yes.
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Locked(props: { teasers: Teaser[]; countWord: string; priceCents: number; onUnlock: () => void; error: string | null }) {
  const price = formatPrice(props.priceCents);
  return (
    <>
      <div className="eyebrow">People here who could help</div>
      <h2 className="h2">{props.countWord} in this room could help with that.</h2>
      <div className="match-grid">
        {props.teasers.map((t) => (
          <div key={t.id} className="hidden-card">
            <div className="hidden-top" aria-hidden>
              <div className="blur-shapes">
                <div style={{ width: 64, height: 64, borderRadius: 16, background: "#A9BFFB", flexShrink: 0 }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ width: 120, height: 14, borderRadius: 4, background: "#5D82F2" }} />
                  <div style={{ width: 90, height: 10, borderRadius: 4, background: "#A9BFFB" }} />
                </div>
              </div>
              <div className="hidden-badge">Hidden · {pct(t.score)} fit</div>
            </div>
            <div className="hidden-body">
              <div style={{ display: "flex" }}>
                <span className="need-pill"><span className="truncate">Helps with: {t.need}</span></span>
              </div>
              <div className="blurb">{t.blurb}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="unlock-panel">
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 20, letterSpacing: "-0.02em" }}>Find out who they are.</div>
          <div style={{ fontSize: 14 }} className="muted">
            For {price} we&apos;ll research them, show you who they are and why to meet, and help you reach out.
          </div>
        </div>
        <button className="reveal-btn" style={{ minWidth: 240 }} onClick={props.onUnlock}>
          <span style={{ whiteSpace: "nowrap" }}>Find my people</span>
          <span className="mono" style={{ whiteSpace: "nowrap" }}>{price}</span>
        </button>
      </div>
      {props.error && <div style={{ fontSize: 14, color: "#b42318" }}>{props.error}</div>}
    </>
  );
}

function Finding({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStage((s) => s + 1), 900);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (stage > FINDING.length) onDone();
  }, [stage, onDone]);
  return (
    <>
      <div className="eyebrow">Finding your people</div>
      <h2 className="h2">Working on your introductions.</h2>
      <StageList stages={FINDING} stage={stage} />
    </>
  );
}

function RevealedCard({ r, onRequest }: { r: Revealed; onRequest: () => void }) {
  return (
    <div className="revealed-card">
      <div className="eyebrow sm" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span>Your introduction · {r.need}</span>
        <span className="muted">{pct(r.score)} fit</span>
      </div>
      <h3 className="h2">{r.headline}</h3>
      <div className="auto-grid g230">
        <div className="id-tile">
          <div style={{ fontWeight: 600, fontSize: 64, letterSpacing: "-0.05em", lineHeight: 1, color: "var(--on-dark-1)" }}>{r.first[0]}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontWeight: 600, fontSize: 24, letterSpacing: "-0.03em" }}>{r.first}</div>
            <div style={{ fontSize: 14, color: "var(--on-dark-2)" }}>{r.role}</div>
            <div style={{ fontSize: 14, color: "var(--on-dark-2)" }}>{r.org}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Block label="Bio"><div style={{ fontSize: 16, color: "var(--text-1)", textWrap: "pretty" }}>{r.bio}</div></Block>
          <Block label={`Why ${r.first} is worth your time`} divided>
            <div className="serif" style={{ fontSize: 17, lineHeight: 1.5, color: "var(--text-2)", textWrap: "pretty" }}>{r.why}</div>
          </Block>
          {r.shared.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="eyebrow sm grey">Ground you share</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {r.shared.map((c) => <span key={c} className="share-pill">{c}</span>)}
              </div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Block label={`What you offer ${r.first}`}><div style={{ fontSize: 16, color: "var(--text-1)", textWrap: "pretty" }}>{r.offer}</div></Block>
          <Block label="Already between you" divided><div style={{ fontSize: 16, color: "var(--text-1)", textWrap: "pretty" }}>{r.between}</div></Block>
        </div>
      </div>
      {r.openers.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div className="eyebrow sm" style={{ paddingBottom: 10, borderBottom: "1px solid var(--line-3)" }}>If you meet, open with</div>
          {r.openers.map((o, i) => (
            <div key={o} style={{ display: "grid", gridTemplateColumns: "32px minmax(0,1fr)", gap: 10, padding: "14px 0", borderBottom: "1px solid var(--line-3)", fontSize: 16 }}>
              <span className="num" style={{ paddingTop: 2 }}>{pad(i)}</span>
              <span>{o}</span>
            </div>
          ))}
        </div>
      )}
      {r.requested ? (
        <div className="sent-bar">
          <span className="dot-done">✓</span>
          <span>Request sent. We&apos;ll introduce you if {r.first} says yes.</span>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn-blue" style={{ padding: "14px 26px", whiteSpace: "nowrap" }} onClick={onRequest}>Ask to reach out</button>
          <span style={{ fontSize: 14 }} className="muted">We&apos;ll ask {r.first} first. You get their contact only if they say yes.</span>
        </div>
      )}
    </div>
  );
}

function Block({ label, divided, children }: { label: string; divided?: boolean; children: React.ReactNode }) {
  return (
    <div className={divided ? "divided" : ""} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="eyebrow sm">{label}</div>
      {children}
    </div>
  );
}
