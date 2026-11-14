import "server-only";
import { db } from "../supabase/server";
import type { JobStatus, LookupResult, Need, PublicEvent, Revealed, Teaser, ViewerPayload } from "../types";
import { matchName } from "./match-name";

type EventRow = { id: string; name: string; slug: string; price_cents: number };

export async function getEvent(slug: string): Promise<(PublicEvent & { id: string }) | null> {
  const s = db();
  const { data: ev } = await s.from("events").select("id, name, slug, price_cents").eq("slug", slug).maybeSingle();
  if (!ev) return null;
  const e = ev as EventRow;
  const { count } = await s.from("research_jobs").select("attendee_id", { count: "exact", head: true }).eq("event_id", e.id).eq("status", "done");
  return { id: e.id, slug: e.slug, name: e.name, priceCents: e.price_cents, researchedCount: count ?? 0 };
}

/** Returns the lookup result plus an attendee id whose pipeline should be kicked. */
export async function lookup(eventId: string, name: string): Promise<{ result: LookupResult; kick?: string }> {
  const s = db();
  const { data } = await s.from("attendees").select("id, name, role").eq("event_id", eventId);
  const hits = matchName(data ?? [], name);
  if (!hits.length) return { result: { status: "not_found" } };
  if (hits.length > 1) return { result: { status: "multiple", candidates: hits.slice(0, 5).map((h) => ({ id: h.id, name: h.name, role: h.role ?? "" })) } };
  return resolve(eventId, hits[0].id);
}

export async function resolve(eventId: string, attendeeId: string): Promise<{ result: LookupResult; kick?: string }> {
  const s = db();
  const { data: a } = await s.from("attendees").select("id, name").eq("id", attendeeId).eq("event_id", eventId).maybeSingle();
  if (!a) return { result: { status: "not_found" } };
  const { data: job } = await s.from("research_jobs").select("status").eq("attendee_id", a.id).maybeSingle();
  if (job?.status === "done") {
    const viewer = await getViewer(eventId, a.id);
    if (viewer) return { result: { status: "found", viewer } };
  }
  if (!job) await s.from("research_jobs").insert({ attendee_id: a.id, event_id: eventId });
  else if (job.status === "failed") await s.from("research_jobs").update({ status: "queued", retries: 0, error: null }).eq("attendee_id", a.id);
  return { result: { status: "researching", attendeeId: a.id, name: a.name }, kick: a.id };
}

export async function addSelf(eventId: string, name: string, linkedin: string) {
  const s = db();
  const li = linkedin.trim().replace(/^https?:\/\/(www\.)?/, "").slice(0, 300) || null;
  const { data, error } = await s
    .from("attendees")
    .insert({ event_id: eventId, name: name.trim().slice(0, 120), linkedin_url: li, went: true, self_added: true })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "insert failed");
  await s.from("research_jobs").insert({ attendee_id: data.id, event_id: eventId });
  return { attendeeId: data.id as string };
}

export async function getJob(eventId: string, attendeeId: string): Promise<JobStatus | null> {
  const { data } = await db().from("research_jobs").select("stage, status").eq("attendee_id", attendeeId).eq("event_id", eventId).maybeSingle();
  return (data as JobStatus | null) ?? null;
}

type ProfileRow = { first_name: string; role: string; org: string; headline: string; background: string; needs: Need[]; sources_used: string };
type BlurbRow = {
  id: string; other_id: string; need: string; blurb: string; headline: string; why: string; shared: string[]; offer: string;
  between: string; openers: string[]; matches: { score: number } | null;
};

export async function getViewer(eventId: string, attendeeId: string): Promise<ViewerPayload | null> {
  const s = db();
  const [{ data: a }, { data: p }, { data: blurbs }, { data: unlock }, { data: reqs }] = await Promise.all([
    s.from("attendees").select("id, name, linkedin_url, role, bio").eq("id", attendeeId).eq("event_id", eventId).maybeSingle(),
    s.from("enriched_profiles").select("*").eq("attendee_id", attendeeId).maybeSingle(),
    s.from("match_blurbs").select("id, other_id, need, blurb, headline, why, shared, offer, between, openers, matches(score)").eq("viewer_id", attendeeId).order("rank"),
    s.from("unlocks").select("id").eq("viewer_id", attendeeId).maybeSingle(),
    s.from("intro_requests").select("blurb_id").eq("viewer_id", attendeeId),
  ]);
  if (!a) return null;
  const prof = p as ProfileRow | null;
  const rows = (blurbs ?? []) as unknown as BlurbRow[];

  const teasers: Teaser[] = rows.map((b) => ({ id: b.id, need: b.need, score: Number(b.matches?.score ?? 0), blurb: b.blurb }));

  let revealed: Revealed[] = [];
  if (unlock && rows.length) {
    const { data: others } = await s.from("enriched_profiles").select("attendee_id, first_name, role, org, background").in("attendee_id", rows.map((r) => r.other_id));
    const byId = new Map((others ?? []).map((o) => [o.attendee_id as string, o]));
    const requested = new Set((reqs ?? []).map((r) => r.blurb_id as string));
    revealed = rows.map((b, i) => {
      const o = byId.get(b.other_id);
      return {
        ...teasers[i],
        headline: b.headline ?? "",
        first: o?.first_name ?? "Someone",
        role: o?.role ?? "",
        org: o?.org ?? "",
        bio: o?.background ?? "",
        why: b.why ?? "",
        shared: b.shared ?? [],
        offer: b.offer ?? "",
        between: b.between ?? "",
        openers: b.openers ?? [],
        requested: requested.has(b.id),
      };
    });
  }

  return {
    profile: {
      id: a.id,
      name: a.name,
      headline: prof?.headline || a.role || "",
      background: prof?.background || a.bio || "",
      linkedin: (a.linkedin_url ?? "").replace(/^https?:\/\/(www\.)?/, ""),
      sourcesLabel: prof?.sources_used === "Sheet only" ? "the event's guest list" : "your LinkedIn and public web pages",
      needs: (prof?.needs ?? []).slice(0, 3),
    },
    teasers,
    unlocked: !!unlock,
    revealed,
  };
}

export async function unlock(event: { id: string; priceCents: number }, viewerId: string) {
  const s = db();
  const { data: a } = await s.from("attendees").select("id").eq("id", viewerId).eq("event_id", event.id).maybeSingle();
  if (!a) return null;
  await s.from("unlocks").upsert(
    { event_id: event.id, viewer_id: viewerId, amount_cents: event.priceCents, paid: true, simulated: true },
    { onConflict: "viewer_id", ignoreDuplicates: true },
  );
  return getViewer(event.id, viewerId);
}

export async function requestIntro(eventId: string, viewerId: string, blurbId: string) {
  const s = db();
  const [{ data: b }, { data: u }] = await Promise.all([
    s.from("match_blurbs").select("id").eq("id", blurbId).eq("viewer_id", viewerId).eq("event_id", eventId).maybeSingle(),
    s.from("unlocks").select("id").eq("viewer_id", viewerId).maybeSingle(),
  ]);
  if (!b || !u) return false;
  await s.from("intro_requests").upsert({ event_id: eventId, viewer_id: viewerId, blurb_id: blurbId }, { onConflict: "viewer_id,blurb_id", ignoreDuplicates: true });
  return true;
}
