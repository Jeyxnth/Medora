"use client";
import { useState } from "react";
import Link from "next/link";
import { Stethoscope, FlaskConical, Pill, FileText, NotebookPen, ChevronDown } from "lucide-react";
import { formatDate } from "@/lib/format";
import { isOutOfRange, formatRange, type TimelineItem, type TimelineType } from "@/lib/timeline";

const TYPES: Record<TimelineType, { label: string; icon: typeof Pill; color: string; dot: string }> = {
  encounter: { label: "Encounters", icon: Stethoscope, color: "bg-sky-100 text-sky-700", dot: "bg-sky-500" },
  lab: { label: "Labs", icon: FlaskConical, color: "bg-violet-100 text-violet-700", dot: "bg-violet-500" },
  medication: { label: "Medications", icon: Pill, color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  document: { label: "Documents", icon: FileText, color: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  note: { label: "Notes", icon: NotebookPen, color: "bg-teal-100 text-teal-700", dot: "bg-teal-500" },
};

function LabTable({ labs }: { labs: NonNullable<TimelineItem["labs"]> }) {
  return (
    <table className="mt-2 w-full text-left text-xs">
      <thead className="text-slate-500">
        <tr><th className="py-1">Test</th><th>Value</th><th>Unit</th><th>Reference</th></tr>
      </thead>
      <tbody>
        {labs.map((l, i) => {
          const bad = isOutOfRange(l);
          const marker = l.ref_low != null && l.value < l.ref_low ? "L" : l.ref_high != null && l.value > l.ref_high ? "H" : bad ? "!" : "";
          return (
            <tr key={i} className="border-t border-slate-100 text-slate-700">
              <td className="py-1">{l.test_name}</td>
              <td>
                <span className={bad ? "font-semibold text-red-600" : ""}>{l.value}{marker && ` ${marker}`}</span>
                {l.prev != null && l.prev !== l.value && (
                  <span className="ml-1 text-slate-500">{l.value > l.prev ? "↑" : "↓"} (was {l.prev})</span>
                )}
              </td>
              <td>{l.unit}</td>
              <td>{formatRange(l)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Item({ item }: { item: TimelineItem }) {
  const [open, setOpen] = useState(false);
  const { icon: Icon, color, dot } = TYPES[item.type];
  return (
    <div className="relative pl-7">
      <span className={`absolute left-0 top-3.5 h-3 w-3 rounded-full ring-4 ring-white ${dot}`} />
      <div className="rounded-xl border border-slate-200 bg-white p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`flex h-6 w-6 items-center justify-center rounded-md ${color}`}><Icon size={13} /></span>
          <span className="text-sm font-medium text-slate-900">{item.title}</span>
          {item.draft && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Draft - needs review</span>}
          {item.labs && (
            <button onClick={() => setOpen(!open)} className="ml-auto flex items-center gap-1 text-xs text-teal-700">
              {open ? "Hide" : "Show"} <ChevronDown size={14} className={open ? "rotate-180" : ""} />
            </button>
          )}
        </div>
        {item.detail && <p className="mt-1 text-sm text-slate-600">{item.detail}</p>}
        {item.labs && open && <LabTable labs={item.labs} />}
        {item.href && (
          <Link href={item.href} className="mt-2 inline-block text-xs font-medium text-teal-700 hover:underline">
            {item.draft ? "Review draft" : item.type === "note" ? "View note" : "View source document"}
          </Link>
        )}
      </div>
    </div>
  );
}

export default function Timeline({ items }: { items: TimelineItem[] }) {
  const [hidden, setHidden] = useState<Set<TimelineType>>(new Set());
  const toggle = (t: TimelineType) => {
    const next = new Set(hidden);
    if (next.has(t)) next.delete(t); else next.add(t);
    setHidden(next);
  };

  const shown = items.filter((i) => !hidden.has(i.type));
  const groups = new Map<string, TimelineItem[]>();
  for (const i of shown) groups.set(i.date, [...(groups.get(i.date) ?? []), i]);

  return (
    <div>
      <div className="sticky top-14 z-10 -mx-5 mb-3 flex flex-wrap gap-2 border-b border-slate-100 bg-white px-5 pb-3">
        {(Object.keys(TYPES) as TimelineType[]).map((t) => {
          const { icon: Icon, label, color } = TYPES[t];
          const on = !hidden.has(t);
          return (
            <button key={t} onClick={() => toggle(t)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium hover:opacity-80 ${on ? `${color} border-transparent` : "border-slate-300 bg-white text-slate-400"}`}>
              <Icon size={13} /> {label}
            </button>
          );
        })}
      </div>
      <div className="space-y-4">
        {[...groups].map(([date, list]) => (
          <section key={date}>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {formatDate(date)}
            </h3>
            <div className="relative space-y-2 before:absolute before:left-[5px] before:top-0 before:h-full before:w-px before:bg-slate-200">
              {list.map((i) => <Item key={i.id} item={i} />)}
            </div>
          </section>
        ))}
        {groups.size === 0 && <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">Nothing to show.</p>}
      </div>
    </div>
  );
}
