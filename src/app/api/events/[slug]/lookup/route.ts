import { NextResponse } from "next/server";
import { getSource } from "@/lib/repo";

export const maxDuration = 300;
type Ctx = { params: Promise<{ slug: string; id?: string }> };
const nf = () => NextResponse.json({ error: "not_found" }, { status: 404 });

export async function GET(req: Request, { params }: Ctx) {
  const src = await getSource((await params).slug);
  if (!src) return nf();
  const name = new URL(req.url).searchParams.get("name") ?? "";
  return NextResponse.json(await src.lookup(name.slice(0, 120)));
}
