import { notFound } from "next/navigation";
import { EventAdmin, type EventAdminData } from "@/components/admin/event-admin";
import { ownedCommunity, ownedEvent, requireUser } from "@/lib/admin";
import { eventProgress } from "@/lib/pipeline/runner";
import { db } from "@/lib/supabase/server";

export default async function EventAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const ev = await ownedEvent(user.id, (await params).id);
  if (!ev) notFound();
  const s = db();
  const [community, { data: people }, { data: blurbs }, progress, { count: unlocks }, { count: intros }] = await Promise.all([
    ownedCommunity(user.id, ev.community_id),
    s.from("attendees").select("id, name, role, linkedin_url, went, self_added, research_jobs(stage, status, error), enriched_profiles(sources_used)").eq("event_id", ev.id).order("created_at"),
    s.from("match_blurbs").select("id, viewer_id, other_id, rank, need, blurb, matches(score, benefit_to_a, benefit_to_b, evidence)").eq("event_id", ev.id).order("viewer_id").order("rank").limit(150),
    eventProgress(ev.id),
    s.from("unlocks").select("id", { count: "exact", head: true }).eq("event_id", ev.id),
    s.from("intro_requests").select("id", { count: "exact", head: true }).eq("event_id", ev.id),
  ]);

  type P = { id: string; name: string; role: string | null; linkedin_url: string | null; went: boolean; self_added: boolean;
    research_jobs: { stage: number; status: string; error: string | null } | { stage: number; status: string; error: string | null }[] | null;
    enriched_profiles: { sources_used: string } | { sources_used: string }[] | null };
  const one = <T,>(x: T | T[] | null) => (Array.isArray(x) ? x[0] ?? null : x);
  const ppl = ((people ?? []) as unknown as P[]).map((p) => {
    const j = one(p.research_jobs);
    return {
      id: p.id, name: p.name, role: p.role ?? "", linkedin: p.linkedin_url ?? "", went: p.went, selfAdded: p.self_added,
      sources: one(p.enriched_profiles)?.sources_used ?? "—",
      stage: j?.stage ?? -1, status: j?.status ?? "none", error: j?.error ?? null,
    };
  });
  const names = Object.fromEntries(ppl.map((p) => [p.id, p.name]));
  type B = { id: string; viewer_id: string; other_id: string; need: string; blurb: string;
    matches: { score: number; benefit_to_a: string; benefit_to_b: string; evidence: { fact: string; source_url: string | null }[] } | null };

  const data: EventAdminData = {
    event: { id: ev.id, name: ev.name, slug: ev.slug, pool: ev.pool, priceCents: ev.price_cents, sheetFilename: ev.sheet_filename, sheetUploadedAt: ev.sheet_uploaded_at },
    community: { id: community?.id ?? ev.community_id, name: community?.name ?? "Community" },
    people: ppl,
    matches: ((blurbs ?? []) as unknown as B[]).map((b) => ({
      id: b.id, a: names[b.viewer_id] ?? "?", b: names[b.other_id] ?? "?", need: b.need, blurb: b.blurb,
      score: Number(b.matches?.score ?? 0), toA: b.matches?.benefit_to_a ?? "", toB: b.matches?.benefit_to_b ?? "", evidence: b.matches?.evidence ?? [],
    })),
    progress,
    unlocks: unlocks ?? 0,
    intros: intros ?? 0,
  };
  return <EventAdmin data={data} />;
}
