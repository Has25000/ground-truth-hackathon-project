import { NextResponse } from "next/server";
import { getSource } from "@/lib/repo";

export const maxDuration = 300;
type Ctx = { params: Promise<{ slug: string; id?: string }> };
const nf = () => NextResponse.json({ error: "not_found" }, { status: 404 });

export async function GET(_req: Request, { params }: Ctx) {
  const { slug, id } = await params;
  const src = await getSource(slug);
  const j = src && id ? await src.job(id) : null;
  return j ? NextResponse.json(j, { headers: { "Cache-Control": "no-store" } }) : nf();
}
