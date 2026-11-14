import { NextResponse } from "next/server";
import { getSource } from "@/lib/repo";

export const maxDuration = 300;
type Ctx = { params: Promise<{ slug: string; id?: string }> };
const nf = () => NextResponse.json({ error: "not_found" }, { status: 404 });

export async function POST(req: Request, { params }: Ctx) {
  const src = await getSource((await params).slug);
  if (!src) return nf();
  const b = (await req.json().catch(() => ({}))) as { name?: string; linkedin_url?: string };
  if (!b.name?.trim()) return NextResponse.json({ error: "name_required" }, { status: 400 });
  return NextResponse.json(await src.addSelf(b.name, b.linkedin_url ?? ""), { status: 201 });
}
