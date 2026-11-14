import "server-only";
import type { Need } from "../types";
import { firecrawlScrape, llmJson, jevEvaluate, mapLimit, youSearch, type JevAnswer } from "./clients";

// Each agent is a pure function of its inputs (no DB access) so it can be
// tested on its own. The runner persists the results.

export type AttendeeRow = {
  id: string;
  event_id: string;
  name: string;
  linkedin_url: string | null;
  went: boolean;
  self_added: boolean;
  role: string | null;
  bio: string | null;
  skills: string[];
  extra: Record<string, string>;
};

export type Fact = { fact: string; source_url: string | null };

export type Profile = {
  attendee_id: string;
  first_name: string;
  role: string;
  org: string;
  headline: string;
  background: string;
  needs: Need[];
  offers: string[];
  summary: string;
  sources_used: string;
};

const sheetLines = (a: AttendeeRow) =>
  [
    `Name: ${a.name}`,
    a.linkedin_url && `LinkedIn: ${a.linkedin_url}`,
    a.role && `Role (from sheet): ${a.role}`,
    a.bio && `Bio (from sheet): ${a.bio}`,
    a.skills.length ? `Skills (from sheet): ${a.skills.join(", ")}` : "",
    ...Object.entries(a.extra ?? {}).map(([k, v]) => (v ? `${k}: ${v}` : "")),
  ]
    .filter(Boolean)
    .join("\n");

const linkedinUrl = (u: string | null) => (u ? (u.startsWith("http") ? u : `https://${u.replace(/^\/+/, "")}`) : null);

// ------------------------------------------------- Agent 1 · Research ---

/** Thrown when the LLM couldn't be reached, so the runner retries instead of saving a thin profile. */
export class LlmUnavailable extends Error {}

/** Extra pages listed in the sheet (Devpost, personal site, GitHub…) worth reading. */
function sheetPages(a: AttendeeRow): string[] {
  const urls = Object.entries(a.extra ?? {})
    .filter(([k, v]) => /devpost|website|site|portfolio|github|personal/i.test(k) && /^https?:\/\//i.test(String(v)))
    .map(([, v]) => String(v));
  return [...new Set(urls)].slice(0, 1);
}

export async function researchAgent(a: AttendeeRow, onStage: (stage: number) => Promise<void>, opts: { allowFallback?: boolean } = {}) {
  const handle = a.linkedin_url?.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1] ?? "";
  const query = [`"${a.name}"`, a.role ?? "", handle.replace(/[-_]/g, " ")].filter(Boolean).join(" ");
  const li = linkedinUrl(a.linkedin_url);
  const extra = sheetPages(a);

  // Everything is fetched in parallel, so reading more sources doesn't add time.
  await onStage(1);
  const [web, liMarkdown, extraPages] = await Promise.all([
    youSearch(query, 8),
    li ? firecrawlScrape(li) : Promise.resolve(null),
    Promise.all(extra.map(async (u) => ({ url: u, md: await firecrawlScrape(u) }))),
  ]);
  const pages = extraPages.filter((p) => p.md);

  const sources = [web.length ? "You.com" : "", liMarkdown || pages.length ? "Firecrawl" : ""].filter(Boolean).join(" + ") || "Sheet only";

  const prompt = `You are a research agent preparing for introductions at an event.
Extract up to 15 factual statements about THIS person.

Identity check — many people share names:
- The LINKEDIN PAGE and the event sheet are the ground truth for who this person is.
- Keep a web result only if it clearly matches them: same LinkedIn handle, or the same employer, school, project, or location as the LinkedIn page/sheet. Their own website, GitHub, or Devpost counts.
- If a web result could be a different person with the same name, leave it out.

Rules:
- Every fact must come from the material below; never invent or generalize beyond it.
- Prefer: current role and company, companies they founded, what they're building, past roles, education, projects, things they've written or said they're looking for.
- Include the source_url the fact came from.

PERSON (from the event's sheet):
${sheetLines(a)}

LINKEDIN PAGE (${li ?? "none"}):
${liMarkdown ? liMarkdown.slice(0, 12000) : "(not available)"}
${pages.map((p) => `\nPAGE LISTED IN THE SHEET (${p.url}):\n${p.md!.slice(0, 5000)}`).join("\n")}

WEB RESULTS:
${web.slice(0, 8).map((w, i) => `[${i + 1}] ${w.title} — ${w.url}\n${w.description.slice(0, 400)}\n${w.snippets.slice(0, 3).join(" ").slice(0, 700)}`).join("\n\n") || "(none)"}`;

  const out = await llmJson<{ facts: Fact[] }>(prompt, {
    type: "OBJECT",
    properties: {
      facts: {
        type: "ARRAY",
        items: { type: "OBJECT", properties: { fact: { type: "STRING" }, source_url: { type: "STRING", nullable: true } }, required: ["fact"] },
      },
    },
    required: ["facts"],
  });

  const hadMaterial = !!liMarkdown || web.length > 0 || pages.length > 0;
  if (!out && hadMaterial && !opts.allowFallback) throw new LlmUnavailable("research extraction failed; will retry");

  let facts: Fact[] = out?.facts?.filter((f) => f.fact?.trim()).slice(0, 15) ?? [];
  if (!facts.length) {
    // Last resort only: what the sheet and LinkedIn give us verbatim.
    if (a.role) facts.push({ fact: `Role: ${a.role}`, source_url: "event sheet" });
    if (a.bio) facts.push({ fact: a.bio, source_url: "event sheet" });
    if (a.skills.length) facts.push({ fact: `Skills: ${a.skills.join(", ")}`, source_url: "event sheet" });
    const headline = liMarkdown?.split("\n").find((l) => l.startsWith("**"))?.replace(/\*/g, "");
    if (headline) facts.push({ fact: headline, source_url: li });
  }
  facts = facts.map((f) => ({ fact: f.fact.trim(), source_url: f.source_url || null }));
  return { facts, sources };
}

// ----------------------------------------------- Agent 2 · Enrichment ---

const NEED_SCHEMA = {
  type: "OBJECT",
  properties: { text: { type: "STRING" }, evidence: { type: "STRING" }, confidence: { type: "NUMBER" } },
  required: ["text", "evidence", "confidence"],
};

export async function enrichAgent(a: AttendeeRow, facts: Fact[], sources: string, opts: { allowFallback?: boolean } = {}): Promise<Profile> {
  const prompt = `You are a context-enrichment agent. From the facts below, build this person's profile for an event matchmaker.

Rules:
- "needs": exactly 3 things this person might benefit from meeting someone about (a collaborator, customers, investors, a hire, advice on X...). They are GUESSES: each needs short evidence pointing to the facts and a confidence from 0 to 1. Be honest: thin evidence means low confidence. Phrase as a short noun phrase, e.g. "Event organizers to pilot your product".
- "offers": 3–5 concrete things they could help others with.
- "headline": one line, what they do and what they're building, written to them in third person without their name.
- "background": 2 sentences.
- "org": current employer or "Independent"/"Stealth" if unclear. "role": short job title.
- Never invent facts not supported below. Don't name a field or industry (e.g. "health-tech") unless a fact mentions it.
- If they founded or are building a company or product, that should drive the needs (customers, users, hires, investors, partners for THAT company).
- Confidence: above 0.7 only when a fact says it directly; 0.4–0.7 for reasonable inferences; below 0.4 when evidence is thin.

PERSON:
${sheetLines(a)}

FACTS:
${facts.map((f) => `- ${f.fact}${f.source_url ? ` (${f.source_url})` : ""}`).join("\n") || "(none)"}`;

  const out = await llmJson<Omit<Profile, "attendee_id" | "sources_used">>(prompt, {
    type: "OBJECT",
    properties: {
      first_name: { type: "STRING" },
      role: { type: "STRING" },
      org: { type: "STRING" },
      headline: { type: "STRING" },
      background: { type: "STRING" },
      needs: { type: "ARRAY", items: NEED_SCHEMA },
      offers: { type: "ARRAY", items: { type: "STRING" } },
      summary: { type: "STRING" },
    },
    required: ["first_name", "role", "org", "headline", "background", "needs", "offers", "summary"],
  });

  const first = a.name.trim().split(/\s+/)[0];
  if (!out && facts.length && !opts.allowFallback) throw new LlmUnavailable("enrichment failed; will retry");
  // Few facts means every guess is shaky: cap the confidence we show.
  const cap = facts.length < 3 ? 0.45 : facts.length < 6 ? 0.75 : 0.95;
  if (out) {
    return {
      attendee_id: a.id,
      first_name: out.first_name || first,
      role: out.role || a.role || "",
      org: out.org || "",
      headline: out.headline,
      background: out.background,
      needs: (out.needs ?? []).slice(0, 3).map((n) => ({ ...n, confidence: Math.max(0, Math.min(cap, Number(n.confidence) || 0.5)) })),
      offers: (out.offers ?? []).slice(0, 5),
      summary: out.summary,
      sources_used: sources,
    };
  }
  // Fallback when the LLM is unavailable: sheet-only profile, low confidence.
  return {
    attendee_id: a.id,
    first_name: first,
    role: a.role ?? "",
    org: "",
    headline: a.role ?? "Attendee",
    background: a.bio ?? facts.map((f) => f.fact).slice(0, 2).join(" "),
    needs: [
      { text: "Collaborators for what you're building", evidence: "Inferred from the event sheet only", confidence: 0.4 },
      { text: "People with complementary skills", evidence: a.skills.length ? `Skills listed: ${a.skills.join(", ")}` : "Inferred from the event sheet only", confidence: 0.35 },
      { text: "Advice from people a step ahead", evidence: "Inferred from the event sheet only", confidence: 0.3 },
    ],
    offers: a.skills.length ? a.skills.slice(0, 4) : a.role ? [a.role] : [],
    summary: a.bio ?? "",
    sources_used: sources,
  };
}

// -------------------------------------------- Agent 3 · Matching (Jev) ---

const profileText = (p: Profile) =>
  `${p.role}${p.org ? ` at ${p.org}` : ""}. ${p.headline}. ${p.background}
Might need: ${p.needs.map((n) => n.text).join("; ")}
Can offer: ${p.offers.join("; ")}`;

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z][a-z0-9+#.-]{3,}/g) ?? []);

function overlapScore(viewer: Profile, other: Profile) {
  const need = words(viewer.needs.map((n) => n.text).join(" "));
  const offer = words(other.offers.join(" ") + " " + other.headline);
  const back = words(other.needs.map((n) => n.text).join(" "));
  const give = words(viewer.offers.join(" ") + " " + viewer.headline);
  let s = 0;
  need.forEach((w) => offer.has(w) && (s += 2));
  back.forEach((w) => give.has(w) && s++);
  return s;
}

export type Scored = { other: Profile; score: number; jev: Record<string, JevAnswer> | null };

export async function matchAgent(viewer: Profile, pool: Profile[]): Promise<Scored[]> {
  const others = pool.filter((p) => p.attendee_id !== viewer.attendee_id);
  if (!others.length) return [];

  // 1) Shortlist: LLM picks ~10 complementary people from the whole pool.
  let shortlist = others;
  if (others.length > 10) {
    const lines = others.map((p, i) => `${i}: ${p.role}${p.org ? ` @ ${p.org}` : ""} | offers: ${p.offers.slice(0, 3).join("; ")} | needs: ${p.needs.map((n) => n.text).join("; ")}`);
    const out = await llmJson<{ picks: number[] }>(
      `Pick the 10 people from the list who would be most valuable for PERSON A to meet, where BOTH sides gain something specific (A's needs met by their offers, and A can offer something they need). Similar backgrounds alone are not a reason.

PERSON A:
${profileText(viewer)}

PEOPLE:
${lines.join("\n")}`,
      { type: "OBJECT", properties: { picks: { type: "ARRAY", items: { type: "INTEGER" } } }, required: ["picks"] },
    );
    const picked = (out?.picks ?? []).filter((i) => Number.isInteger(i) && others[i]).map((i) => others[i]);
    shortlist = picked.length >= 3
      ? [...new Set(picked)].slice(0, 10)
      : [...others].sort((x, y) => overlapScore(viewer, y) - overlapScore(viewer, x)).slice(0, 10);
  }

  // 2) Jev scores benefit both ways for every shortlisted pair.
  const scored = await mapLimit(shortlist, 5, async (other): Promise<Scored> => {
    const jev = await jevEvaluate(`PERSON A:\n${profileText(viewer)}\n\nPERSON B:\n${profileText(other)}`, {
      benefit_to_a: {
        type: "score",
        instructions: "How much would Person A concretely benefit from meeting Person B, given A's likely needs and what B can offer?",
        criteria: ["No real benefit", "Small or generic benefit", "Clear benefit", "Strong, specific benefit"],
      },
      benefit_to_b: {
        type: "score",
        instructions: "How much would Person B concretely benefit from meeting Person A, given B's likely needs and what A can offer?",
        criteria: ["No real benefit", "Small or generic benefit", "Clear benefit", "Strong, specific benefit"],
      },
      specific: {
        type: "noul",
        instructions: "Is there a specific, actionable reason for these two to meet, beyond having similar backgrounds?",
        criteria: { true: "A concrete reason both can act on", false: "Only similarity or vague overlap" },
      },
    });
    if (!jev) return { other, score: Math.min(0.7, 0.3 + overlapScore(viewer, other) * 0.05), jev: null };
    const a = (jev.benefit_to_a?.score ?? 0) / 3;
    const b = (jev.benefit_to_b?.score ?? 0) / 3;
    const s = jev.specific?.noul ?? 0;
    return { other, score: Math.round((0.5 * a + 0.25 * b + 0.25 * s) * 1000) / 1000, jev };
  });

  return scored.sort((x, y) => y.score - x.score);
}

// ------------------------------------------------------ Blurb writer ---

export type Intro = {
  other_id: string;
  need: string;
  score: number;
  jev: Record<string, JevAnswer> | null;
  benefit_to_viewer: string;
  benefit_to_other: string;
  explanation: string;
  blurb: string;
  headline: string;
  why: string;
  shared: string[];
  offer: string;
  between: string;
  openers: string[];
  evidence: Fact[];
};

function scrub(text: string, other: Profile, otherName: string) {
  // Remove anything that names the person or their employer.
  let t = text;
  const tokens = [...otherName.split(/\s+/), other.first_name, ...(other.org ? [other.org, ...other.org.split(/\s+/)] : [])]
    .map((x) => x?.trim())
    .filter((x): x is string => !!x && x.length >= 3 && !/^(inc|llc|the|and|labs?|ai|company|independent|stealth)$/i.test(x));
  for (const tok of tokens.sort((x, y) => y.length - x.length)) {
    t = t.replace(new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "their company");
  }
  return t.replace(/their company('s)? their company/gi, "their company");
}

export async function blurbAgent(
  viewer: Profile,
  ranked: Scored[],
  names: Record<string, string>,
  facts: Record<string, Fact[]>,
): Promise<Intro[]> {
  const top = ranked.slice(0, 6);
  if (!top.length) return [];

  const ask = (cands: Scored[], count: number) => llmJson<{ intros: Omit<Intro, "score" | "jev">[] }>(
    `You write introductions for an event matchmaker. The VIEWER will see people who could help them.
Write EXACTLY ${count} introductions, choosing the ${count} best people below for the VIEWER. Copy each other_id exactly from the candidate's "id:" line. Prefer higher scores, but where possible each one should address a DIFFERENT one of the viewer's needs.

For each, write:
- need: 1–3 word label of the viewer need they address (e.g. "Technical partner", "Investors", "Event organizers").
- blurb: 1–2 sentences, ANONYMOUS. Describe what they work on at a general level and how that helps this viewer's need. NEVER include their name, company, school, exact job title, handles, project names, or any detail rare enough to identify them in a room of 300. No claims beyond the evidence.
- headline: one sentence reason to meet, starting with their first name.
- why: why they're worth the viewer's time (1–2 sentences, address the viewer as "you").
- shared: 2–3 short topics they have in common.
- offer: what the viewer offers them (1 sentence).
- between: what's already between them (1 sentence).
- openers: exactly 2 questions the viewer could open with.
- benefit_to_viewer, benefit_to_other: one sentence each.
- explanation: 1–2 sentences on why this is mutual.
- evidence: 1–3 facts (copied from their FACTS) that support the match, with source_url.

VIEWER:
${profileText(viewer)}
Viewer needs: ${viewer.needs.map((n, i) => `${i + 1}. ${n.text}`).join("  ")}

CANDIDATES:
${cands
  .map(
    (s) => `--- id: ${s.other.attendee_id} | score ${s.score}
First name: ${s.other.first_name}
${profileText(s.other)}
FACTS: ${(facts[s.other.attendee_id] ?? []).slice(0, 6).map((f) => `${f.fact} [${f.source_url ?? "n/a"}]`).join(" | ")}`,
  )
  .join("\n")}`,
    {
      type: "OBJECT",
      properties: {
        intros: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              other_id: { type: "STRING" },
              need: { type: "STRING" },
              blurb: { type: "STRING" },
              headline: { type: "STRING" },
              why: { type: "STRING" },
              shared: { type: "ARRAY", items: { type: "STRING" } },
              offer: { type: "STRING" },
              between: { type: "STRING" },
              openers: { type: "ARRAY", items: { type: "STRING" } },
              benefit_to_viewer: { type: "STRING" },
              benefit_to_other: { type: "STRING" },
              explanation: { type: "STRING" },
              evidence: {
                type: "ARRAY",
                items: { type: "OBJECT", properties: { fact: { type: "STRING" }, source_url: { type: "STRING", nullable: true } }, required: ["fact"] },
              },
            },
            required: ["other_id", "need", "blurb", "headline", "why", "shared", "offer", "between", "openers", "benefit_to_viewer", "benefit_to_other", "explanation"],
          },
        },
      },
      required: ["intros"],
    },
  );

  const byId = new Map(top.map((s) => [s.other.attendee_id, s]));
  const wanted = Math.min(3, top.length);
  const seen = new Set<string>();
  let intros: Intro[] = [];
  // Ask again for any missing slots (the LLM sometimes returns fewer or garbles an id).
  for (let attempt = 0; attempt < 2 && intros.length < wanted; attempt++) {
    const cands = top.filter((s) => !seen.has(s.other.attendee_id));
    const out = await ask(cands, wanted - intros.length);
    for (const x of out?.intros ?? []) {
      const s = byId.get(x.other_id?.trim());
      if (!s || seen.has(s.other.attendee_id) || intros.length >= wanted || !x.blurb) continue;
      seen.add(s.other.attendee_id);
      intros.push({
        ...x,
        other_id: s.other.attendee_id,
        score: s.score,
        jev: s.jev,
        blurb: scrub(x.blurb, s.other, names[s.other.attendee_id] ?? ""),
        shared: (x.shared ?? []).slice(0, 3),
        openers: (x.openers ?? []).slice(0, 2),
        evidence: x.evidence ?? [],
      });
    }
  }

  if (intros.length < wanted) {
    // Template fallback so the attendee still gets introductions.
    const rest = top.filter((s) => !seen.has(s.other.attendee_id)).slice(0, wanted - intros.length);
    intros = intros.concat(rest.map((s, i) => {
      const need = viewer.needs[i % Math.max(1, viewer.needs.length)]?.text ?? "Connections";
      const o = s.other;
      return {
        other_id: o.attendee_id,
        need: need.split(" ").slice(0, 3).join(" "),
        score: s.score,
        jev: s.jev,
        benefit_to_viewer: o.offers[0] ?? o.headline,
        benefit_to_other: viewer.offers[0] ?? viewer.headline,
        explanation: "Complementary needs and offers.",
        blurb: scrub(`Works on ${o.offers.slice(0, 2).join(" and ") || "related problems"}. Could help with ${need.toLowerCase()}.`, o, names[o.attendee_id] ?? ""),
        headline: `${o.first_name} could help with ${need.toLowerCase()}.`,
        why: o.background,
        shared: [],
        offer: viewer.offers[0] ?? "A new perspective on their work.",
        between: "You're both at this event.",
        openers: [`What are you working on right now?`, `What would be most useful for you to get out of tonight?`],
        evidence: (facts[o.attendee_id] ?? []).slice(0, 2),
      };
    }));
  }
  return intros;
}
