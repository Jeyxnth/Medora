import type { SupabaseClient } from "@supabase/supabase-js";

// Role of the signed-in user (null if not signed in or no profile).
export async function currentRole(supabase: SupabaseClient): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return data?.role ?? null;
}
