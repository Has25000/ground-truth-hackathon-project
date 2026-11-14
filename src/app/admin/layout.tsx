import { requireUser } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 14, padding: "8px 28px", background: "var(--soft-2)", borderBottom: "1px solid var(--line-1)", fontSize: 13 }}>
        <span className="muted">{user.email}</span>
        <form action="/auth/signout" method="post">
          <button className="btn-text" style={{ fontSize: 13, textDecoration: "underline" }}>Sign out</button>
        </form>
      </div>
      {children}
    </>
  );
}
