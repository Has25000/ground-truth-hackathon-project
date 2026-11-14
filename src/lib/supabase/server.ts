import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const url = () => {
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!u) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return u;
};

/** Full-access client (secret key). Server only — always check ownership first. */
export function db() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Session-aware client for reading the signed-in host. */
export async function authClient() {
  const store = await cookies();
  return createServerClient(url(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* called from a Server Component; proxy.ts refreshes the session */
        }
      },
    },
  });
}

export async function currentUser() {
  const supabase = await authClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
