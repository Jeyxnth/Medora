"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import { isOutOfRange } from "@/lib/timeline";
import { DEFAULT_TESTS, groupSeries, trendInsights, type TrendLab } from "@/lib/trends";

const MAX_CHARTS = 3;
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
const shortDate = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", year: "2-digit" });

type Point = { t: number; value: number; unit: string | null; bad: boolean; docId: string | null };

function Chart({ test, labs, patientId }: { test: string; labs: TrendLab[]; patientId: string }) {
  const points: Point[] = labs.map((l) => ({
    t: Date.parse(l.collected_date!), value: l.value, unit: l.unit, bad: isOutOfRange(l), docId: l.document_id,
  }));
  const ref = [...labs].reverse().find((l) => l.ref_low != null || l.ref_high != null);
  const vals = [...points.map((p) => p.value), ...(ref?.ref_low != null ? [ref.ref_low] : []), ...(ref?.ref_high != null ? [ref.ref_high] : [])];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = (max - min || max || 1) * 0.15;
  const lo = Math.max(0, min - pad);
  const hi = max + pad;
  const last = labs[labs.length - 1];

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-900">{test}</h3>
        <span className="text-xs text-slate-500">
          Latest {last.value} {last.unit}
          {last.document_id && <> · <Link href={`/patients/${patientId}/documents/${last.document_id}`} className="text-teal-700 hover:underline">source</Link></>}
        </span>
      </div>
      <div className="mt-2 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
            {ref && <ReferenceArea y1={ref.ref_low ?? lo} y2={ref.ref_high ?? hi} fill="#14b8a6" fillOpacity={0.12} stroke="none" ifOverflow="extendDomain" />}
            <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={shortDate} tick={{ fontSize: 11, fill: "#64748b" }} padding={{ left: 10, right: 10 }} />
            <YAxis domain={[lo, hi]} tickFormatter={(v: number) => String(Math.round(v * 10) / 10)} tick={{ fontSize: 11, fill: "#64748b" }} width={44} />
            <Tooltip
              trigger="click"
              wrapperStyle={{ pointerEvents: "auto", zIndex: 10 }}
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
                if (!p) return null;
                return (
                  <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow">
                    <div className="font-medium text-slate-900">{day(p.t)}</div>
                    <div className={p.bad ? "text-red-600" : ""}>{p.value} {p.unit}{p.bad && " (out of range)"}</div>
                    {p.docId && <Link href={`/patients/${patientId}/documents/${p.docId}`} className="text-teal-700 hover:underline">source document</Link>}
                  </div>
                );
              }}
            />
            <Line
              type="monotone" dataKey="value" stroke="#0f766e" strokeWidth={2} isAnimationActive={false}
              dot={(d: { cx?: number; cy?: number; payload?: Point; index?: number }) => (
                <circle key={d.index} cx={d.cx} cy={d.cy} r={4} fill={d.payload?.bad ? "#dc2626" : "#0f766e"} stroke="#fff" strokeWidth={1.5} />
              )}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function TrendsCard({ patientId, labs }: { patientId: string; labs: TrendLab[] }) {
  const series = useMemo(() => groupSeries(labs), [labs]);
  const tests = [...series.keys()].filter((t) => series.get(t)!.length >= 2);
  const insights = useMemo(() => trendInsights(series), [series]);
  const [selected, setSelected] = useState<string[]>(() => {
    const d = DEFAULT_TESTS.filter((t) => tests.includes(t));
    return d.length ? d : tests.slice(0, 1);
  });

  const toggle = (t: string) =>
    setSelected((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t].slice(-MAX_CHARTS)));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-semibold text-slate-900">Trends</h2>
      {tests.length === 0 ? (
        <p className="text-sm text-slate-500">Trends appear once a test has two or more results.</p>
      ) : (
        <>
          {insights.length > 0 && (
            <div className="mb-3 space-y-2">
              {insights.map((i) => (
                <p key={i.test} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <TrendingUp size={16} className="mt-0.5 shrink-0" /> {i.text}
                </p>
              ))}
            </div>
          )}
          <div className="mb-3 flex flex-wrap gap-2">
            {tests.map((t) => (
              <button key={t} onClick={() => toggle(t)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${selected.includes(t) ? "border-transparent bg-teal-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}>
                {t}
              </button>
            ))}
          </div>
          {selected.length === 0 ? (
            <p className="text-sm text-slate-500">Choose a test above (up to {MAX_CHARTS} at a time).</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {selected.map((t) => <Chart key={t} test={t} labs={series.get(t)!} patientId={patientId} />)}
            </div>
          )}
          <p className="mt-2 text-xs text-slate-400">Shaded band = reference range. Red dots are out of range. Click a point for details.</p>
        </>
      )}
    </div>
  );
}
