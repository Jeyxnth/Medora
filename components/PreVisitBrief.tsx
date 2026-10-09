"use client";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ClipboardList, FileText, Loader2, Printer, X } from "lucide-react";
import { formatDate } from "@/lib/format";
import SafetyAlerts from "@/components/SafetyAlerts";
import CareGaps from "@/components/CareGaps";
import type { BriefResult } from "@/app/api/brief/route";
import type { AskStatement } from "@/app/api/ask/route";

export default function PreVisitBrief({ patientId, patientName, tile = false }: { patientId: string; patientName: string; tile?: boolean }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [brief, setBrief] = useState<BriefResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/brief", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patientId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      setBrief(json);
    } catch (e) {
      setBrief(null);
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  const statements = (list: AskStatement[]) =>
    list.length === 0 ? <p className="text-sm text-slate-500">Nothing to show from the approved records.</p> : (
      <ul className="space-y-2">
        {list.map((s, i) => (
          <li key={i} className="text-sm text-slate-800">
            <p>{s.text}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {s.sources.map((id) => {
                const src = brief?.sources[id];
                return src && (
                  <Link key={id} href={src.href} className="flex items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800 ring-1 ring-brand-200 hover:bg-brand-100">
                    <FileText size={11} /> {src.label}
                  </Link>
                );
              })}
              {!s.verified && (
                <span title={s.reason} className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
                  <AlertTriangle size={11} /> Could not be verified against the cited record
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    );

  const h = "mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500";

  return (
    <>
      {tile ? (
        <button onClick={generate} disabled={loading} className="no-print tile disabled:opacity-60">
          <span className="tile-icon">{loading ? <Loader2 size={18} className="animate-spin" /> : <ClipboardList size={18} />}</span> Pre-visit brief
        </button>
      ) : (
        <button onClick={generate} disabled={loading} className="no-print flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <ClipboardList size={16} />} Pre-visit brief
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8 print:static print:bg-transparent print:p-0">
          <div id="brief" className="card w-full max-w-2xl space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Pre-visit brief: {patientName}</h2>
                <span className="badge badge-draft mt-1">AI draft, doctor to review</span>
              </div>
              <div className="no-print flex gap-1">
                <button onClick={() => window.print()} disabled={!brief} className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Printer size={15} /> Print</button>
                <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
              </div>
            </div>

            {loading && (
              <div className="space-y-2" role="status">
                <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 size={16} className="animate-spin text-brand-600" /> Reading approved records...</p>
                <div className="animate-pulse space-y-2"><div className="h-3 w-11/12 rounded bg-slate-200" /><div className="h-3 w-2/3 rounded bg-slate-200" /></div>
              </div>
            )}
            {error && !loading && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

            {brief && !loading && (
              <>
                <section><h3 className={h}>Last visit</h3>{statements(brief.lastVisit)}</section>

                <section>
                  <h3 className={h}>Key trends</h3>
                  {brief.trends.length === 0 ? <p className="text-sm text-slate-500">No worsening trends found.</p> : (
                    <ul className="space-y-1 text-sm text-slate-800">{brief.trends.map((t) => <li key={t.test}>{t.text}</li>)}</ul>
                  )}
                </section>

                <section><SafetyAlerts alerts={brief.alerts} title="Active safety alerts" /></section>

                <section><CareGaps gaps={brief.careGaps} onNavigate={() => setOpen(false)} /></section>

                <section>
                  <h3 className={h}>Open and overdue tasks</h3>
                  {brief.tasks.length === 0 ? <p className="text-sm text-slate-500">No open tasks.</p> : (
                    <ul className="space-y-1 text-sm text-slate-800">
                      {brief.tasks.map((t) => (
                        <li key={t.id} className="flex items-center gap-2">
                          <span>{t.title}</span>
                          {t.due_date && <span className="text-xs text-slate-500">Due {formatDate(t.due_date)}</span>}
                          {t.overdue && <span className="badge badge-draft">Overdue</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section><h3 className={h}>Suggested things to discuss</h3>{statements(brief.discuss)}</section>
                <p className="text-xs text-slate-500">AI-generated from approved records only. Trends, alerts, care gaps and tasks come from the records directly. Verify before acting.</p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
