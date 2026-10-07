import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import Avatar from "./Avatar";
import LogoutButton from "./LogoutButton";
import NavLinks from "./NavLinks";

export default async function Header() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("full_name, role").eq("id", user.id).single()
    : { data: null };
  const name = profile?.full_name ?? user?.email;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex h-full items-center gap-6">
          <Link href="/patients" className="text-xl font-bold tracking-tight text-teal-700">Medora</Link>
          <NavLinks showAudit={can(profile?.role, "view_audit")} />
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Avatar name={name} size="sm" />
          <span className="hidden font-medium text-slate-800 sm:inline">{name}</span>
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
