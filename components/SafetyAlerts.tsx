import Link from "next/link";
import { AlertOctagon, AlertTriangle, ShieldCheck } from "lucide-react";
import type { Alert } from "@/lib/safety";

const STYLE = {
  critical: { box: "border-red-500 bg-red-50", title: "text-red-900", text: "text-red-900", icon: AlertOctagon, iconColor: "text-red-600", tag: "Critical" },
  warning: { box: "border-amber-500 bg-amber-50", title: "text-amber-900", text: "text-amber-900", icon: AlertTriangle, iconColor: "text-amber-600", tag: "Warning" },
};

export default function SafetyAlerts({ alerts, title = "Safety alerts", emptyText = "No safety alerts found" }: {
  alerts: Alert[]; title?: string; emptyText?: string;
}) {
  return (
    <div className="space-y-3">
      {title && <h2 className="card-title">{title}</h2>}
      {alerts.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-emerald-700"><ShieldCheck size={16} /> {emptyText}</p>
      ) : (
        alerts.map((a) => {
          const s = STYLE[a.severity];
          const Icon = s.icon;
          return (
            <div key={a.key} className={`flex gap-3 rounded-xl border border-l-4 px-4 py-3 text-sm ${s.box}`}>
              <Icon size={20} className={`mt-0.5 shrink-0 ${s.iconColor}`} />
              <div className="min-w-0 flex-1">
                <p className={`flex flex-wrap items-center gap-2 font-bold ${s.title}`}>{a.title}
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium">{s.tag}</span>
                </p>
                <p className={`mt-1 font-normal ${s.text}`}>{a.detail}</p>
                {a.evidence.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    {a.evidence.map((e, i) => (
                      <li key={i}>
                        {e.href
                          ? <Link href={e.href} className="inline-block rounded-md bg-white/80 px-2 py-0.5 font-medium text-slate-800 ring-1 ring-black/10 hover:bg-white">{e.label}</Link>
                          : <span className="inline-block rounded-md bg-white/60 px-2 py-0.5 text-slate-700 ring-1 ring-black/5">{e.label}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })
      )}
      <p className="text-xs text-slate-500">Decision support only. Clinician judgement required.</p>
    </div>
  );
}
