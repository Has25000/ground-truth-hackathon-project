import { NextResponse } from "next/server";
import { apiUser, notFound, ownedEvent } from "@/lib/admin";
import { ensureJobs, eventProgress } from "@/lib/pipeline/runner";
import { db } from "@/lib/supabase/server";

// Wipes stored research, profiles and matches for the event so the next run
// starts everyone from scratch. Paid unlocks are kept.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, deny } = await apiUser();
  if (!user) return deny;
  const ev = await ownedEvent(user.id, (await params).id);
  if (!ev) return notFound();

  const s = db();
  const { data: people } = await s.from("attendees").select("id").eq("event_id", ev.id);
  const ids = (people ?? []).map((p) => p.id as string);
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    await s.from("research_findings").delete().in("attendee_id", chunk);
    await s.from("enriched_profiles").delete().in("attendee_id", chunk);
  }
  await s.from("matches").delete().eq("event_id", ev.id);
  await ensureJobs(ev.id);
  await s
    .from("research_jobs")
    .update({ stage: 0, status: "queued", retries: 0, error: null, locked_until: null, updated_at: new Date().toISOString() })
    .eq("event_id", ev.id);
  return NextResponse.json(await eventProgress(ev.id));
}
