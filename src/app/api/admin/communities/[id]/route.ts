import { NextResponse } from "next/server";
import { apiUser, bad, notFound, ownedCommunity } from "@/lib/admin";
import { db } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { user, deny } = await apiUser();
  if (!user) return deny;
  const c = await ownedCommunity(user.id, (await params).id);
  if (!c) return notFound();
  const { name } = (await req.json().catch(() => ({}))) as { name?: string };
  if (!name?.trim()) return bad("name_required");
  await db().from("communities").update({ name: name.trim().slice(0, 120) }).eq("id", c.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { user, deny } = await apiUser();
  if (!user) return deny;
  const c = await ownedCommunity(user.id, (await params).id);
  if (!c) return notFound();
  await db().from("communities").delete().eq("id", c.id);
  return NextResponse.json({ ok: true });
}
