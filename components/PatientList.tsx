"use client";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Search } from "lucide-react";
import { ageFromDob } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import Avatar from "./Avatar";

type P = {
  id: string; name: string; dob: string | null; sex: string | null; mrn: string | null;
  allergies: string[]; lastVisit: string | null;
};

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
          className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div className="card divide-y divide-slate-100 overflow-hidden">
        {shown.map((p) => (
          <Link key={p.id} href={`/patients/${p.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-brand-50/50">
            <Avatar name={p.name} />
            <div className="min-w-0 flex-1 basis-48">
              <div className="font-semibold text-slate-900">{p.name}</div>
              <div className="text-sm text-slate-500">
                {ageFromDob(p.dob) ?? "?"} y · {p.sex ?? "—"} · MRN {p.mrn ?? "—"}
              </div>
            </div>
            {p.allergies.length > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200">
                <AlertTriangle size={12} /> {p.allergies.slice(0, 2).join(", ")}{p.allergies.length > 2 && ` +${p.allergies.length - 2}`}
              </span>
            )}
            <span className="text-sm text-slate-500 sm:w-40">{p.lastVisit ? `Last visit ${formatDate(p.lastVisit)}` : "No visits yet"}</span>
            <ChevronRight size={16} className="text-slate-300" />
          </Link>
        ))}
        {shown.length === 0 && <p className="px-4 py-6 text-sm text-slate-500">No patients found.</p>}
      </div>
    </div>
  );
}
