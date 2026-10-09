"use client";
import { AlertTriangle, ClipboardCheck, FileText, Info } from "lucide-react";
import { focusItem } from "@/lib/focus";
import type { CareGap } from "@/lib/care-gaps";

const SEV = {
  attention: { box: "alert-card alert-warning", icon: AlertTriangle, iconColor: "text-amber-700" },
  info: { box: "alert-card alert-info", icon: Info, iconColor: "text-brand-700" },
};

// Rule-based prompts. They inform only; nothing here changes a record.
export default function CareGaps({ gaps, title = "Care gaps", onNavigate }: { gaps: CareGap[]; title?: string; onNavigate?: () => void }) {
  return (
    <div className="space-y-2">
      <p className="eyebrow">Review prompts</p>
      <h2 className="card-title flex items-center gap-2"><ClipboardCheck size={16} className="text-brand-600" /> {title}</h2>
      <p className="text-xs text-slate-500">Rule-based prompts for the doctor to review. They are not diagnoses and do not change any record.</p>
      {gaps.length === 0 ? (
        <p className="text-sm text-slate-600">No care gaps found by these rules.</p>
      ) : (
        gaps.map((g) => (
          <div key={g.id} className={`flex gap-3 ${SEV[g.severity].box}`}>
            {(() => { const Icon = SEV[g.severity].icon; return <Icon size={18} className={`mt-0.5 shrink-0 ${SEV[g.severity].iconColor}`} />; })()}
            <div className="min-w-0 flex-1">
            <p className="font-bold">{g.rule}</p>
            <p className="mt-1">{g.message}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {g.evidence.map((e, i) => e.focus ? (
                <button key={i} type="button" onClick={() => { onNavigate?.(); setTimeout(() => focusItem(e.focus!), 50); }}
                  className="flex items-center gap-1 rounded-md bg-white/80 px-2 py-0.5 text-xs font-medium text-brand-800 ring-1 ring-brand-200 hover:bg-white">
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
          </div>
        ))
      )}
    </div>
  );
}
