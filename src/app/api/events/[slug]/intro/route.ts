import { NextResponse } from "next/server";
import { getSource } from "@/lib/repo";

export const maxDuration = 300;
type Ctx = { params: Promise<{ slug: string; id?: string }> };
const nf = () => NextResponse.json({ error: "not_found" }, { status: 404 });

export async function POST(req: Request, { params }: Ctx) {
  const src = await getSource((await params).slug);
  if (!src) return nf();
  const b = (await req.json().catch(() => ({}))) as { viewer_id?: string; blurb_id?: string };
  const ok = b.viewer_id && b.blurb_id ? await src.requestIntro(b.viewer_id, b.blurb_id) : false;
  return ok ? NextResponse.json({ ok: true }) : nf();
}
