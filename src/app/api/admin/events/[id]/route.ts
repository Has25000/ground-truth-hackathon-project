import { NextResponse } from "next/server";
import { apiUser, bad, notFound, ownedEvent, slugify } from "@/lib/admin";
import { ensureJobs, eventProgress } from "@/lib/pipeline/runner";
import { db } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { user, deny } = await apiUser();
  if (!user) return deny;
  const ev = await ownedEvent(user.id, (await params).id);
  if (!ev) return notFound();
  return NextResponse.json(await eventProgress(ev.id), { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { user, deny } = await apiUser();
  if (!user) return deny;
  const ev = await ownedEvent(user.id, (await params).id);
  if (!ev) return notFound();
  const b = (await req.json().catch(() => ({}))) as { name?: string; slug?: string; pool?: string };
  const patch: Record<string, unknown> = {};
  if (b.name?.trim()) patch.name = b.name.trim().slice(0, 120);
  if (b.slug !== undefined) {
    const slug = slugify(b.slug);
    if (slug.length < 2 || slug === "demo") return bad("Pick a different page link.");
    patch.slug = slug;
  }
  if (b.pool === "went" || b.pool === "all") patch.pool = b.pool;
  const { error } = await db().from("events").update(patch).eq("id", ev.id);
  if (error) return bad(error.code === "23505" ? "That page link is taken. Try another." : error.message);
  if (patch.pool && patch.pool !== ev.pool) await ensureJobs(ev.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { user, deny } = await apiUser();
  if (!user) return deny;
  const ev = await ownedEvent(user.id, (await params).id);
  if (!ev) return notFound();
  await db().from("events").delete().eq("id", ev.id);
  return NextResponse.json({ ok: true });
}
