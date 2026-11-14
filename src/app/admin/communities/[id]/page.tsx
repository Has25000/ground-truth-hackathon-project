import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateForm, DangerButton } from "@/components/admin/forms";
import { ownedCommunity, requireUser } from "@/lib/admin";
import { db } from "@/lib/supabase/server";

export default async function CommunityPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const c = await ownedCommunity(user.id, (await params).id);
  if (!c) notFound();
  const { data } = await db().from("events").select("id, name, slug, created_at, attendees(count)").eq("community_id", c.id).order("created_at", { ascending: false });
  const events = (data ?? []) as unknown as { id: string; name: string; slug: string; attendees: { count: number }[] }[];

  return (
    <main className="admin-main">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="crumbs"><Link href="/admin">Communities</Link><span>/</span></div>
        <h1 style={{ margin: 0, fontWeight: 600, fontSize: 44, lineHeight: 1, letterSpacing: "-0.045em" }}>{c.name}</h1>
      </div>
      <div className="card">
        <div className="admin-eyebrow">New event</div>
        <CreateForm
          action={`/api/admin/communities/${c.id}/events`}
          fields={[{ name: "name", placeholder: "Event name", required: true }, { name: "slug", placeholder: "page-link (optional)" }]}
          button="Create event"
          goToPrefix="/admin/events/"
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {events.length === 0 && <div className="muted">No events yet.</div>}
        {events.map((e) => (
          <Link key={e.id} href={`/admin/events/${e.id}`} className="list-row">
            <span style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontWeight: 500, fontSize: 17 }}>{e.name}</span>
              <span className="muted" style={{ fontSize: 13 }}>/e/{e.slug}</span>
            </span>
            <span className="mono muted" style={{ fontSize: 12 }}>{e.attendees?.[0]?.count ?? 0} people →</span>
          </Link>
        ))}
      </div>
      <div><DangerButton action={`/api/admin/communities/${c.id}`} label="Delete community" confirmText={`Delete ${c.name} and all its events? This can't be undone.`} then="/admin" /></div>
    </main>
  );
}
