import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { currentRole } from "@/lib/roles";
import { ActionBadge, RoleBadge, formatTime } from "@/components/AuditBadge";

const ACTIONS = ["view", "ask", "edit", "update", "extract", "create_note", "approve", "discard", "task.draft_created", "task.confirm", "task.dismiss", "task.complete", "brief.generate"];
type Details = { confirmed_by?: string; changes?: { item: string; field: string; from: string | null; to: string | null }[]; confirmed_as_read?: string[]; added?: string[]; removed?: string[]; safety_alerts?: string[] };

// What the doctor changed from the AI reading when confirming a prescription.
function ReviewDetails({ d }: { d: Details }) {
  const lines = [
    ...(d.changes ?? []).map((c) => `${c.item} · ${c.field}: "${c.from ?? ""}" → "${c.to ?? ""}"`),
    ...(d.confirmed_as_read ?? []).map((c) => `Confirmed as read: ${c}`),
    ...(d.added ?? []).map((c) => `Added: ${c}`),
    ...(d.removed ?? []).map((c) => `Removed: ${c}`),
    ...(d.safety_alerts ?? []).map((c) => `Safety alert: ${c}`),
  ];
  return (
    <details className="mt-1 text-xs text-slate-700">
      <summary className="cursor-pointer text-brand-700">Review details ({d.changes?.length ?? 0} changes)</summary>
      <p className="mt-1">Confirmed by {d.confirmed_by ?? "unknown"}</p>
      <ul className="list-disc pl-4">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </details>
  );
}

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function AuditPage(props: PageProps<"/audit">) {
  const sp = await props.searchParams;
  const supabase = await createClient();
  if (!can(await currentRole(supabase), "view_audit")) {
    redirect(`/patients?notice=${encodeURIComponent("The audit log is only available to doctors.")}`);
  }
  const [action, user, patient] = [one(sp.action), one(sp.user), one(sp.patient)];

  let q = supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(300);
  if (action) q = q.eq("action", action);
  if (user) q = q.eq("user_id", user);
  if (patient) q = q.eq("patient_id", patient);

  const [{ data: rows }, { data: profiles }, { data: patients }] = await Promise.all([
    q,
    supabase.from("profiles").select("id, full_name, role").order("full_name"),
    supabase.from("patients").select("id, name").order("name"),
  ]);
  const userById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const patientById = new Map((patients ?? []).map((p) => [p.id, p.name as string]));
  const select = "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900";

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Admin</p>
        <h1 className="page-title">Audit log</h1>
      </div>

      <form className="flex flex-wrap items-end gap-3 card p-4">
        <label className="text-xs font-medium text-slate-600">Action
          <select name="action" defaultValue={action} className={`${select} mt-1 block`}>
            <option value="">All</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">User
          <select name="user" defaultValue={user} className={`${select} mt-1 block`}>
            <option value="">All</option>
            {(profiles ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name} ({p.role})</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">Patient
          <select name="patient" defaultValue={patient} className={`${select} mt-1 block`}>
            <option value="">All</option>
            {(patients ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <button className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">Filter</button>
        <Link href="/audit" className="py-2 text-sm text-brand-700 hover:underline">Reset</Link>
      </form>

      <div className="overflow-x-auto card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-2">Time</th><th className="px-4 py-2">User</th><th className="px-4 py-2">Action</th><th className="px-4 py-2">Entity</th><th className="px-4 py-2">Patient</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {(rows ?? []).map((r) => {
              const u = userById.get(r.user_id);
              const name = r.patient_id ? patientById.get(r.patient_id) : null;
              return (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-600">{formatTime(r.created_at)}</td>
                  <td className="px-4 py-2">{u ? <span className="flex items-center gap-2">{u.full_name} <RoleBadge role={u.role} /></span> : <span className="text-slate-400">unknown</span>}</td>
                  <td className="px-4 py-2"><ActionBadge action={r.action} /></td>
                  <td className="px-4 py-2">{r.entity_type}{r.entity_id && <span className="ml-1 font-mono text-xs text-slate-400">{String(r.entity_id).slice(0, 8)}</span>}{r.details && <ReviewDetails d={r.details} />}</td>
                  <td className="px-4 py-2">{r.patient_id ? <Link href={`/patients/${r.patient_id}`} className="text-brand-700 hover:underline">{name ?? "Patient"}</Link> : <span className="text-slate-400">—</span>}</td>
                </tr>
              );
            })}
            {!rows?.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No entries.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Showing the latest {rows?.length ?? 0} entries (max 300).</p>
    </div>
  );
}
