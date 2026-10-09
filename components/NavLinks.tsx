"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLinks({ showAudit }: { showAudit: boolean }) {
  const path = usePathname();
  const links = [
    { href: "/patients", label: "Patients", active: path.startsWith("/patients") },
    ...(showAudit ? [{ href: "/audit", label: "Audit log", active: path.startsWith("/audit") }] : []),
  ];
  return (
    <nav className="flex h-full items-stretch gap-1">
      {links.map((l) => (
        <Link key={l.href} href={l.href}
          className={`flex items-center border-b-2 px-3 text-sm font-medium ${l.active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-600 hover:text-brand-700"}`}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
