const COLORS: Record<string, string> = {
  view: "bg-slate-100 text-slate-700 ring-slate-200",
  ask: "bg-sky-50 text-sky-800 ring-sky-200",
  edit: "bg-amber-50 text-amber-800 ring-amber-200",
  update: "bg-amber-50 text-amber-800 ring-amber-200",
  extract: "bg-violet-50 text-violet-800 ring-violet-200",
  create_note: "bg-violet-50 text-violet-800 ring-violet-200",
  approve: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  discard: "bg-red-50 text-red-800 ring-red-200",
};

export function ActionBadge({ action }: { action: string | null }) {
  const a = action ?? "?";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${COLORS[a] ?? COLORS.view}`}>{a.replace("_", " ")}</span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  return <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold capitalize text-teal-700 ring-1 ring-teal-200">{role}</span>;
}

export const formatTime = (t: string) => `${new Date(t).toISOString().slice(0, 16).replace("T", " ")} UTC`;
