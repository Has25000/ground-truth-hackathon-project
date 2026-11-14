import Link from "next/link";
import { CreateForm } from "@/components/admin/forms";
import { requireUser } from "@/lib/admin";
import { db } from "@/lib/supabase/server";

export default async function AdminHome() {
  const user = await requireUser();
  const { data } = await db().from("communities").select("id, name, created_at, events(count)").eq("owner_id", user.id).order("created_at", { ascending: false });
  const communities = (data ?? []) as unknown as { id: string; name: string; events: { count: number }[] }[];

  return (
    <main className="admin-main">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="eyebrow">Admin</div>
        <h1 style={{ margin: 0, fontWeight: 600, fontSize: 44, lineHeight: 1, letterSpacing: "-0.045em" }}>Your communities</h1>
        <div className="muted" style={{ fontSize: 14 }}>A community holds your events. Each event gets its own page for guests.</div>
      </div>
      <div className="card">
        <div className="admin-eyebrow">New community</div>
        <CreateForm action="/api/admin/communities" fields={[{ name: "name", placeholder: "e.g. NYC Founders Community", required: true }]} button="Create" goToPrefix="/admin/communities/" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {communities.length === 0 && <div className="muted">No communities yet. Create one above.</div>}
        {communities.map((c) => (
          <Link key={c.id} href={`/admin/communities/${c.id}`} className="list-row">
            <span style={{ fontWeight: 500, fontSize: 17 }}>{c.name}</span>
            <span className="mono muted" style={{ fontSize: 12 }}>{c.events?.[0]?.count ?? 0} events →</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
