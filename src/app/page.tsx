import Link from "next/link";
import { BRAND, TAGLINE } from "@/lib/brand";

const STEPS = [
  { n: "01", t: "Upload your guest list", d: "A sheet with names, LinkedIn URLs and who showed up. That's all we need." },
  { n: "02", t: "We research everyone", d: "Public web and LinkedIn research, then a guess at what each person needs and can offer — with evidence." },
  { n: "03", t: "Guests find their people", d: "Each guest types their name and sees who in the room could help them, and why it's worth both people's time." },
];

export default function Home() {
  return (
    <>
      <section className="hero landing-hero">
        <div className="hero-inner">
          <div className="eyebrow" style={{ color: "var(--on-dark-1)" }}>Introductions for events</div>
          <h1>{TAGLINE}</h1>
          <p className="hero-lead">
            {BRAND} reads your guest list, works out what each person is working on and what they need, and introduces them to the
            people who can help — matched on mutual benefit, not lookalike résumés.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
            <Link href="/admin" className="btn-white">Host an event</Link>
          </div>
        </div>
      </section>
      <main className="col" style={{ maxWidth: 1040, gap: 28 }}>
        <div className="eyebrow">How it works</div>
        <h2 className="h2">Three steps, no app to install.</h2>
        <div className="steps">
          {STEPS.map((s) => (
            <div key={s.n} className="step-card">
              <span className="num">{s.n}</span>
              <div style={{ fontWeight: 600, fontSize: 20, letterSpacing: "-0.02em" }}>{s.t}</div>
              <div className="serif" style={{ fontSize: 17, lineHeight: 1.5, color: "var(--text-2)" }}>{s.d}</div>
            </div>
          ))}
        </div>
      </main>
      <footer className="site-footer">
        <span>{BRAND}</span>
        <span>Every need we show is a guess, with the evidence behind it.</span>
      </footer>
    </>
  );
}
