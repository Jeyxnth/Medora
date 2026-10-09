"use client";
import { ClipboardCheck, FileText } from "lucide-react";
import { focusItem } from "@/lib/focus";
import type { CareGap } from "@/lib/care-gaps";

const SEV = {
  attention: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-sky-200 bg-sky-50 text-sky-900",
};

// Rule-based prompts. They inform only; nothing here changes a record.
export default function CareGaps({ gaps, title = "Care gaps", onNavigate }: { gaps: CareGap[]; title?: string; onNavigate?: () => void }) {
  return (
    <div className="space-y-2">
      <h2 className="card-title flex items-center gap-2"><ClipboardCheck size={16} className="text-teal-600" /> {title}</h2>
      <p className="text-xs text-slate-500">Rule-based prompts for the doctor to review. They are not diagnoses and do not change any record.</p>
      {gaps.length === 0 ? (
        <p className="text-sm text-slate-600">No care gaps found by these rules.</p>
      ) : (
        gaps.map((g) => (
          <div key={g.id} className={`rounded-xl border px-4 py-3 text-sm ${SEV[g.severity]}`}>
            <p className="font-medium">{g.rule}</p>
            <p className="mt-1">{g.message}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {g.evidence.map((e, i) => e.focus ? (
                <button key={i} type="button" onClick={() => { onNavigate?.(); setTimeout(() => focusItem(e.focus!), 50); }}
                  className="flex items-center gap-1 rounded-md bg-white/80 px-2 py-0.5 text-xs font-medium text-teal-800 ring-1 ring-teal-200 hover:bg-white">
                  <FileText size={11} /> {e.label}
                </button>
              ) : (
                <span key={i} className="rounded-md bg-white/80 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">{e.label}</span>
              ))}
            </div>
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer font-medium underline">Why this appears</summary>
              <p className="mt-1">{g.why}</p>
            </details>
          </div>
        ))
      )}
    </div>
  );
}
