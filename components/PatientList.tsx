"use client";
import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { ageFromDob } from "@/lib/utils";

type P = { id: string; name: string; dob: string | null; sex: string | null; mrn: string | null };

export default function PatientList({ patients }: { patients: P[] }) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const shown = patients.filter((p) => !term || p.name.toLowerCase().includes(term) || (p.mrn ?? "").toLowerCase().includes(term));

  return (
    <div>
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-3 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or MRN"
          className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {shown.map((p) => (
          <Link key={p.id} href={`/patients/${p.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-400 hover:shadow">
            <div className="font-semibold text-slate-900">{p.name}</div>
            <div className="mt-1 text-sm text-slate-500">
              {ageFromDob(p.dob) ?? "?"} y · {p.sex ?? "—"} · MRN {p.mrn ?? "—"}
            </div>
          </Link>
        ))}
        {shown.length === 0 && <p className="text-sm text-slate-500">No patients found.</p>}
      </div>
    </div>
  );
}
