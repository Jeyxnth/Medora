import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "./LogoutButton";

export default async function Header() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("full_name, role").eq("id", user.id).single()
    : { data: null };

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/patients" className="text-xl font-bold tracking-tight text-teal-700">Medora</Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium text-slate-800">{profile?.full_name ?? user?.email}</span>
          {profile && (
            <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold capitalize text-teal-700 ring-1 ring-teal-200">
              {profile.role}
            </span>
          )}
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
