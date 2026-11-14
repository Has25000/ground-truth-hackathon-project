import { NextResponse } from "next/server";
import { apiUser, notFound, ownedEvent } from "@/lib/admin";
import { ensureJobs, runEventSlice } from "@/lib/pipeline/runner";

export const maxDuration = 300;

// Processes one ~45s slice of the event's pipeline. The admin page calls this
// in a loop while "Run" is active; each call picks up where the last stopped.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, deny } = await apiUser();
  if (!user) return deny;
  const ev = await ownedEvent(user.id, (await params).id);
  if (!ev) return notFound();
  if (new URL(req.url).searchParams.get("start") === "1") await ensureJobs(ev.id);
  return NextResponse.json(await runEventSlice(ev.id, 45_000));
}
