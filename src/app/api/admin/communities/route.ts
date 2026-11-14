import { NextResponse } from "next/server";
import { apiUser, bad } from "@/lib/admin";
import { db } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { user, deny } = await apiUser();
  if (!user) return deny;
  const { name } = (await req.json().catch(() => ({}))) as { name?: string };
  if (!name?.trim()) return bad("name_required");
  const { data, error } = await db().from("communities").insert({ owner_id: user.id, name: name.trim().slice(0, 120) }).select("id").single();
  if (error) return bad(error.message);
  return NextResponse.json(data, { status: 201 });
}
