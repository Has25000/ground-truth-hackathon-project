"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND } from "@/lib/brand";

export function SiteHeader() {
  const path = usePathname();
  const on = (p: string) => (path === p || path.startsWith(p + "/") ? "on" : "");
  return (
    <header className="site-header">
      <Link href="/" className="wordmark">{BRAND}</Link>
      <nav className="nav">
        <Link href="/admin" className={on("/admin")}>Admin</Link>
      </nav>
    </header>
  );
}
