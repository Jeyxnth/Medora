"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight, ListChecks, Sparkles, X } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { Task } from "@/lib/tasks";
import { completeTask, confirmTask, dismissTask } from "@/app/(app)/patients/[id]/tasks-actions";

type Props = {
  patientId: string; tasks: Task[]; today: string; noteDates: Record<string, string>;
  canConfirm: boolean; canDismiss: boolean; canComplete: boolean;
};

export default function TasksCard({ patientId, tasks, today, noteDates, canConfirm, canDismiss, canComplete }: Props) {
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: (id: string) => Promise<{ error?: string }>, id: string) =>
    start(async () => setError((await fn(id)).error ?? null));

  const drafts = tasks.filter((t) => t.status === "draft");
  const open = tasks.filter((t) => t.status === "open");
  const finished = tasks.filter((t) => t.status === "done" || t.status === "dismissed");

  const source = (t: Task) =>
    t.note_id && noteDates[t.note_id] ? (
      <Link href={`/patients/${patientId}/notes/${t.note_id}`} className="text-xs text-teal-700 hover:underline">
        from note, {formatDate(noteDates[t.note_id])}
      </Link>
    ) : null;

  const due = (t: Task) => t.due_date && <span className="text-xs text-slate-500">Due {formatDate(t.due_date)}</span>;
  const btn = "rounded-md px-2 py-0.5 text-xs font-medium disabled:opacity-50";

  return (
    <div className="card p-4">
      <h2 className="card-title mb-2 flex items-center gap-2"><ListChecks size={16} className="text-teal-600" /> Follow-up tasks</h2>
      {tasks.length === 0 && <p className="text-sm text-slate-500">No tasks yet. They are drafted when a consultation note is approved.</p>}
      {error && <p className="mb-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p>}

      <ul className="divide-y divide-slate-100">
        {drafts.map((t) => (
          <li key={t.id} className="space-y-1 py-2">
            <div className="flex items-start gap-2 text-sm text-slate-800">
              <span className="mt-0.5 flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800 ring-1 ring-violet-200"><Sparkles size={11} /> AI draft</span>
              <span>{t.title}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {due(t)} {source(t)}
              {(canConfirm || canDismiss) && (
                <span className="ml-auto flex gap-1">
                  {canConfirm && <button disabled={pending} onClick={() => run(confirmTask, t.id)} className={`${btn} bg-teal-600 text-white hover:bg-teal-700`}>Confirm</button>}
                  {canDismiss && <button disabled={pending} onClick={() => run(dismissTask, t.id)} className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}>Dismiss</button>}
                </span>
              )}
            </div>
          </li>
        ))}
        {open.map((t) => {
          const overdue = !!t.due_date && t.due_date < today;
          return (
            <li key={t.id} className="py-2">
              <label className="flex items-start gap-2 text-sm text-slate-800">
                <input type="checkbox" className="mt-1" checked={false} disabled={!canComplete || pending} onChange={() => run(completeTask, t.id)} />
                <span className="flex-1">{t.title}</span>
                {overdue && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Overdue</span>}
              </label>
              <div className="ml-6 flex flex-wrap items-center gap-2">{due(t)} {source(t)}</div>
            </li>
          );
        })}
      </ul>

      {finished.length > 0 && (
        <div className="mt-2 border-t border-slate-100 pt-2">
          <button type="button" onClick={() => setShowDone(!showDone)} className="flex items-center gap-1 text-xs font-medium text-slate-600">
            {showDone ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Completed ({finished.length})
          </button>
          {showDone && (
            <ul className="mt-1 space-y-1">
              {finished.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm text-slate-500">
                  {t.status === "done" ? <Check size={14} className="text-emerald-600" /> : <X size={14} className="text-slate-400" />}
                  <span className={t.status === "dismissed" ? "line-through" : ""}>{t.title}</span>
                  <span className="ml-auto text-xs">{t.status === "done" ? "Done" : "Dismissed"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
