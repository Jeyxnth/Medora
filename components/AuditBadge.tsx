const COLORS: Record<string, string> = {
  view: "bg-slate-100 text-slate-700 ring-slate-200",
  ask: "bg-sky-50 text-sky-800 ring-sky-200",
  edit: "bg-amber-50 text-amber-800 ring-amber-200",
  update: "bg-amber-50 text-amber-800 ring-amber-200",
  extract: "bg-violet-50 text-violet-800 ring-violet-200",
  create_note: "bg-violet-50 text-violet-800 ring-violet-200",
  approve: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  discard: "bg-red-50 text-red-800 ring-red-200",
  "task.draft_created": "bg-violet-50 text-violet-800 ring-violet-200",
  "task.confirm": "bg-emerald-50 text-emerald-800 ring-emerald-200",
  "task.dismiss": "bg-red-50 text-red-800 ring-red-200",
  "task.complete": "bg-emerald-50 text-emerald-800 ring-emerald-200",
  "brief.generate": "bg-sky-50 text-sky-800 ring-sky-200",
};

export function ActionBadge({ action }: { action: string | null }) {
  const a = action ?? "?";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${COLORS[a] ?? COLORS.view}`}>{a.replace("_", " ")}</span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  return <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold capitalize text-brand-700 ring-1 ring-brand-200">{role}</span>;
}

export { formatDateTime as formatTime } from "@/lib/format";
