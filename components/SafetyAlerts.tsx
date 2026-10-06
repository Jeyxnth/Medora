import Link from "next/link";
import { AlertOctagon, AlertTriangle, ShieldCheck } from "lucide-react";
import type { Alert } from "@/lib/safety";

const STYLE = {
  critical: { box: "border-red-200 bg-red-50 text-red-900", icon: AlertOctagon, tag: "Critical" },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: AlertTriangle, tag: "Warning" },
};

export default function SafetyAlerts({ alerts, title = "Safety alerts", emptyText = "No safety alerts found" }: {
  alerts: Alert[]; title?: string; emptyText?: string;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {alerts.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-emerald-700"><ShieldCheck size={16} /> {emptyText}</p>
      ) : (
        alerts.map((a) => {
          const { box, icon: Icon, tag } = STYLE[a.severity];
          return (
            <div key={a.key} className={`rounded-xl border px-4 py-3 text-sm ${box}`}>
              <p className="flex items-center gap-2 font-medium"><Icon size={16} className="shrink-0" /> {a.title}
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium">{tag}</span>
              </p>
              <p className="mt-1">{a.detail}</p>
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                {a.evidence.map((e, i) => (
                  <li key={i}>{e.href ? <Link href={e.href} className="underline">{e.label}</Link> : e.label}</li>
                ))}
              </ul>
            </div>
          );
        })
      )}
      <p className="text-xs text-slate-400">Decision support only. Clinician judgement required.</p>
    </div>
  );
}
