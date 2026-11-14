import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { currentUser, db } from "./supabase/server";

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** For API routes: the signed-in host or a 401 response. */
export async function apiUser() {
  const user = await currentUser();
  return user ? { user, deny: null } : { user: null, deny: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
}

export async function ownedCommunity(userId: string, id: string) {
  const { data } = await db().from("communities").select("*").eq("id", id).eq("owner_id", userId).maybeSingle();
  return data as { id: string; name: string; owner_id: string; created_at: string } | null;
}

export type EventRow = {
  id: string; community_id: string; owner_id: string; name: string; slug: string; pool: "went" | "all";
  price_cents: number; sheet_filename: string | null; sheet_uploaded_at: string | null; created_at: string;
};

export async function ownedEvent(userId: string, id: string) {
  const { data } = await db().from("events").select("*").eq("id", id).eq("owner_id", userId).maybeSingle();
  return data as EventRow | null;
}

export const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });
export const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
