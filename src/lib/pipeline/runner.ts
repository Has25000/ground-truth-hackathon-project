import "server-only";
import { db } from "../supabase/server";
import { blurbAgent, enrichAgent, matchAgent, researchAgent, type AttendeeRow, type Fact, type Profile } from "./agents";
import { mapLimit } from "./clients";

// Stages (research_jobs.stage): 0 search, 1 linkedin, 2 enrich, 3 match, 4 blurbs, 5 done.
export const DONE = 5;
const MATCH_STAGE = 3;
// How many people are processed at once (Claude's limits allow far more than Groq's free tier).
const RESEARCH_PARALLEL = Number(process.env.RESEARCH_PARALLEL ?? 12);
const MATCH_PARALLEL = Number(process.env.MATCH_PARALLEL ?? 10);

type Job = { attendee_id: string; event_id: string; stage: number; retries: number };
type Supa = ReturnType<typeof db>;

async function setStage(s: Supa, id: string, stage: number, extra: Record<string, unknown> = {}) {
  await s.from("research_jobs").update({ stage, updated_at: new Date().toISOString(), ...extra }).eq("attendee_id", id);
}

async function loadAttendee(s: Supa, id: string) {
  const { data } = await s.from("attendees").select("*").eq("id", id).single();
  return data as AttendeeRow | null;
}

async function poolProfiles(s: Supa, eventId: string) {
  const { data: ev } = await s.from("events").select("pool").eq("id", eventId).single();
  let q = s.from("attendees").select("id, name, went, self_added, enriched_profiles(*)").eq("event_id", eventId);
  if (ev?.pool !== "all") q = q.or("went.eq.true,self_added.eq.true");
  const { data } = await q;
  const rows = (data ?? []) as unknown as { id: string; name: string; enriched_profiles: Profile | Profile[] | null }[];
  const names: Record<string, string> = {};
  const profiles: Profile[] = [];
  for (const r of rows) {
    names[r.id] = r.name;
    const p = Array.isArray(r.enriched_profiles) ? r.enriched_profiles[0] : r.enriched_profiles;
    if (p) profiles.push(p);
  }
  return { profiles, names };
}

/** Advance one job through stages up to (and including) `untilStage - 1`. */
async function advance(s: Supa, job: Job, untilStage: number) {
  const a = await loadAttendee(s, job.attendee_id);
  if (!a) return;
  let stage = job.stage;

  try {
    // Agent 1 — research (skip if findings already stored: reruns don't repeat API calls)
    if (stage < 2 && untilStage > 1) {
      const { count } = await s.from("research_findings").select("id", { count: "exact", head: true }).eq("attendee_id", a.id);
      let sources = "Sheet only";
      if (!count) {
        await setStage(s, a.id, 0);
        const r = await researchAgent(a, (st) => setStage(s, a.id, st), { allowFallback: job.retries >= 2 });
        sources = r.sources;
        if (r.facts.length) await s.from("research_findings").insert(r.facts.map((f) => ({ attendee_id: a.id, fact: f.fact, source_url: f.source_url })));
      }
      stage = 2;
      await setStage(s, a.id, stage, { error: null });
      (job as Job & { sources?: string }).sources = sources;
    }

    // Agent 2 — enrichment
    if (stage === 2 && untilStage > 2) {
      const { data: facts } = await s.from("research_findings").select("fact, source_url").eq("attendee_id", a.id);
      const { data: prior } = await s.from("enriched_profiles").select("sources_used").eq("attendee_id", a.id).maybeSingle();
      const sources = (job as Job & { sources?: string }).sources ?? prior?.sources_used ?? "Sheet only";
      const p = await enrichAgent(a, (facts ?? []) as Fact[], sources, { allowFallback: job.retries >= 2 });
      await s.from("enriched_profiles").upsert({ ...p, updated_at: new Date().toISOString() });
      stage = 3;
      await setStage(s, a.id, stage);
    }

    // Agent 3 — matching (Jev) + blurbs
    if (stage >= MATCH_STAGE && untilStage > MATCH_STAGE) {
      const { profiles, names } = await poolProfiles(s, a.event_id);
      const viewer = profiles.find((p) => p.attendee_id === a.id);
      if (!viewer) throw new Error("viewer has no enriched profile");
      await setStage(s, a.id, 3);
      const ranked = await matchAgent(viewer, profiles);

      await setStage(s, a.id, 4);
      const topIds = ranked.slice(0, 6).map((r) => r.other.attendee_id);
      const { data: f } = await s.from("research_findings").select("attendee_id, fact, source_url").in("attendee_id", topIds.length ? topIds : ["00000000-0000-0000-0000-000000000000"]);
      const facts: Record<string, Fact[]> = {};
      for (const row of f ?? []) (facts[row.attendee_id] ??= []).push({ fact: row.fact, source_url: row.source_url });
      const intros = await blurbAgent(viewer, ranked, names, facts);

      // Replace this viewer's stored matches
      await s.from("matches").delete().eq("attendee_a", a.id);
      for (const [i, x] of intros.entries()) {
        const { data: m, error } = await s
          .from("matches")
          .insert({
            event_id: a.event_id,
            attendee_a: a.id,
            attendee_b: x.other_id,
            benefit_to_a: x.benefit_to_viewer,
            benefit_to_b: x.benefit_to_other,
            score: x.score,
            jev: x.jev ?? {},
            explanation: x.explanation,
            evidence: x.evidence,
          })
          .select("id")
          .single();
        if (error || !m) throw new Error(error?.message ?? "match insert failed");
        await s.from("match_blurbs").insert({
          event_id: a.event_id,
          match_id: m.id,
          viewer_id: a.id,
          other_id: x.other_id,
          rank: i + 1,
          need: x.need,
          blurb: x.blurb,
          headline: x.headline,
          why: x.why,
          shared: x.shared,
          offer: x.offer,
          between: x.between,
          openers: x.openers,
        });
      }
      stage = DONE;
      await setStage(s, a.id, DONE, { status: "done", locked_until: null, error: null });
      return;
    }

    await s.from("research_jobs").update({ status: "queued", locked_until: null, updated_at: new Date().toISOString() }).eq("attendee_id", a.id);
  } catch (e) {
    const retries = job.retries + 1;
    await s
      .from("research_jobs")
      .update({
        status: retries >= 3 ? "failed" : "queued",
        retries,
        error: e instanceof Error ? e.message.slice(0, 500) : String(e),
        locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("attendee_id", a.id);
  }
}

/** Run the whole pipeline for one person (self-add / late lookup). */
export async function runAttendee(attendeeId: string) {
  const s = db();
  const { data } = await s.rpc("claim_job", { p_attendee: attendeeId });
  const job = (data as Job[] | null)?.[0];
  if (job) await advance(s, job, DONE);
}

/**
 * One slice of batch work for an event. Research + enrichment run for the
 * whole pool first; matching starts once nobody is left before stage 3, so
 * everyone is matched against the full room. Call repeatedly until idle.
 */
export async function runEventSlice(eventId: string, budgetMs = 45_000) {
  const s = db();
  const started = Date.now();
  while (Date.now() - started < budgetMs) {
    const { count: early } = await s
      .from("research_jobs")
      .select("attendee_id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .in("status", ["queued", "running"])
      .lt("stage", MATCH_STAGE);

    const matching = !early;
    const { data } = await s.rpc("claim_jobs", {
      p_event: eventId,
      p_max: matching ? MATCH_PARALLEL : RESEARCH_PARALLEL,
      p_max_stage: matching ? 4 : 2,
    });
    const jobs = (data ?? []) as Job[];
    if (!jobs.length) break;
    await mapLimit(jobs, jobs.length, (j) => advance(s, j, matching ? DONE : MATCH_STAGE));
  }
  return eventProgress(eventId);
}

export async function eventProgress(eventId: string) {
  const s = db();
  const { data } = await s.from("research_jobs").select("stage, status").eq("event_id", eventId);
  const jobs = data ?? [];
  const at = (n: number) => jobs.filter((j) => j.stage >= n).length;
  return {
    total: jobs.length,
    research: at(2),
    enrichment: at(3),
    matching: at(4),
    blurbs: at(5),
    failed: jobs.filter((j) => j.status === "failed").length,
    pending: jobs.filter((j) => j.status === "queued" || j.status === "running").length,
  };
}

/** Make sure every pool member has a job; reset failed ones. */
export async function ensureJobs(eventId: string) {
  const s = db();
  const { data: ev } = await s.from("events").select("pool").eq("id", eventId).single();
  let q = s.from("attendees").select("id").eq("event_id", eventId);
  if (ev?.pool !== "all") q = q.or("went.eq.true,self_added.eq.true");
  const { data: people } = await q;
  const ids = (people ?? []).map((p) => p.id);
  if (ids.length) {
    await s.from("research_jobs").upsert(
      ids.map((id) => ({ attendee_id: id, event_id: eventId })),
      { onConflict: "attendee_id", ignoreDuplicates: true },
    );
  }
  await s.from("research_jobs").update({ status: "queued", retries: 0, error: null, locked_until: null }).eq("event_id", eventId).eq("status", "failed");
  // People who left the pool stop being processed.
  if (ids.length) await s.from("research_jobs").delete().eq("event_id", eventId).not("attendee_id", "in", `(${ids.join(",")})`);
  else await s.from("research_jobs").delete().eq("event_id", eventId);
}
