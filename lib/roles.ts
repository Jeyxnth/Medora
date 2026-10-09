import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

// Signed-in user from the JWT (signature checked locally, no network round trip). Cached per request.
export const currentUser = cache(async (supabase: SupabaseClient): Promise<{ id: string; email?: string } | null> => {
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ? { id: data.claims.sub, email: data.claims.email as string | undefined } : null;
});

// Profile of the signed-in user. Cached per request, so Header and the page share one query.
export const currentProfile = cache(async (supabase: SupabaseClient) => {
  const user = await currentUser(supabase);
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).single();
  return data as { full_name: string; role: string } | null;
});

// Role of the signed-in user (null if not signed in or no profile).
export async function currentRole(supabase: SupabaseClient): Promise<string | null> {
  return (await currentProfile(supabase))?.role ?? null;
}
