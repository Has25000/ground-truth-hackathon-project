import { NextResponse } from "next/server";
import { getSource } from "@/lib/repo";

export const maxDuration = 300;
type Ctx = { params: Promise<{ slug: string; id?: string }> };
const nf = () => NextResponse.json({ error: "not_found" }, { status: 404 });

// Simulated $5 checkout: logs an `unlocks` row and returns the revealed people.
export async function POST(req: Request, { params }: Ctx) {
  const src = await getSource((await params).slug);
  if (!src) return nf();
  const b = (await req.json().catch(() => ({}))) as { viewer_id?: string };
  const v = b.viewer_id ? await src.unlock(b.viewer_id) : null;
  return v ? NextResponse.json(v) : nf();
}
