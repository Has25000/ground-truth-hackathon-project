import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventPage } from "@/components/event/event-page";
import { BRAND } from "@/lib/brand";
import { getEvent } from "@/lib/repo/live";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const ev = await getEvent((await params).slug);
  return { title: ev ? `${ev.name} · ${BRAND}` : BRAND };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const ev = await getEvent((await params).slug);
  if (!ev) notFound();
  const { id: _id, ...event } = ev;
  return <EventPage event={event} />;
}
