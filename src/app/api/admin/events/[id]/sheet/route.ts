import { NextResponse } from "next/server";
import { apiUser, bad, notFound, ownedEvent } from "@/lib/admin";
import { ensureJobs } from "@/lib/pipeline/runner";
import { db } from "@/lib/supabase/server";

type Row = { name: string; linkedin_url?: string; went?: boolean; role?: string; bio?: string; skills?: string[]; extra?: Record<string, string> };

// Replaces the uploaded people (self-added attendees are kept).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, deny } = await apiUser();
  if (!user) return deny;
  const ev = await ownedEvent(user.id, (await params).id);
  if (!ev) return notFound();
  const b = (await req.json().catch(() => ({}))) as { filename?: string; rows?: Row[] };
  const rows = (b.rows ?? []).filter((r) => r.name?.trim()).slice(0, 5000);
  if (!rows.length) return bad("No rows with a name.");

  const s = db();
  await s.from("attendees").delete().eq("event_id", ev.id).eq("self_added", false);
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({
      event_id: ev.id,
      name: r.name.trim().slice(0, 120),
      linkedin_url: r.linkedin_url?.trim().replace(/^https?:\/\/(www\.)?/, "").slice(0, 300) || null,
      went: !!r.went,
      role: r.role?.trim().slice(0, 200) || null,
      bio: r.bio?.trim().slice(0, 2000) || null,
      skills: (r.skills ?? []).slice(0, 30),
      extra: r.extra ?? {},
    }));
    const { error } = await s.from("attendees").insert(chunk);
    if (error) return bad(error.message);
  }
  await s.from("events").update({ sheet_filename: b.filename?.slice(0, 200) ?? "sheet.csv", sheet_uploaded_at: new Date().toISOString() }).eq("id", ev.id);
  await ensureJobs(ev.id);
  return NextResponse.json({ ok: true, rows: rows.length });
}
