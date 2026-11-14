import { NextResponse } from "next/server";
import { apiUser, bad, notFound, ownedCommunity, slugify } from "@/lib/admin";
import { db } from "@/lib/supabase/server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, deny } = await apiUser();
  if (!user) return deny;
  const c = await ownedCommunity(user.id, (await params).id);
  if (!c) return notFound();
  const b = (await req.json().catch(() => ({}))) as { name?: string; slug?: string };
  if (!b.name?.trim()) return bad("name_required");
  const slug = slugify(b.slug || b.name);
  if (slug.length < 2 || slug === "demo") return bad("Pick a different page link.");
  const { data, error } = await db()
    .from("events")
    .insert({ community_id: c.id, owner_id: user.id, name: b.name.trim().slice(0, 120), slug })
    .select("id")
    .single();
  if (error) return bad(error.code === "23505" ? "That page link is taken. Try another." : error.message);
  return NextResponse.json(data, { status: 201 });
}
