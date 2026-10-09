import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Download, MessageSquareText, Upload, Mic, Phone, Pill } from "lucide-react";
import { FHIR_DISCLAIMER } from "@/lib/fhir";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { buildTimeline } from "@/lib/timeline";
import { ageFromDob } from "@/lib/utils";
import { can } from "@/lib/permissions";
import { currentRole } from "@/lib/roles";
import { ActionBadge, RoleBadge, formatTime } from "@/components/AuditBadge";
import { checkSafety } from "@/lib/safety";
import type { TrendLab } from "@/lib/trends";
import Avatar from "@/components/Avatar";
import Timeline from "@/components/Timeline";
import SafetyAlerts from "@/components/SafetyAlerts";
import CareGaps from "@/components/CareGaps";
import { careGaps } from "@/lib/care-gaps";
import TrendsCard from "@/components/TrendsCard";
import AskMedora from "@/components/AskMedora";
import FocusHighlight from "@/components/FocusHighlight";
import TasksCard from "@/components/TasksCard";
import PreVisitBrief from "@/components/PreVisitBrief";
import type { Task } from "@/lib/tasks";

export default async function PatientPage(props: PageProps<"/patients/[id]">) {
  const { id } = await props.params;
  const { notice } = await props.searchParams;
  const supabase = await createClient();

  // One round of parallel queries. The audit log reads start as soon as the role is known (doctors only).
  const accessLogFor = async (role: string | null) => {
    if (!can(role, "view_audit")) return { rows: [], names: new Map<string, { full_name: string; role: string }>() };
    const [log, profs] = await Promise.all([
      supabase.from("audit_log").select("id, action, created_at, user_id")
        .eq("patient_id", id).order("created_at", { ascending: false }).limit(10),
      supabase.from("profiles").select("id, full_name, role"),
    ]);
    return { rows: log.data ?? [], names: new Map((profs.data ?? []).map((p) => [p.id as string, p as { full_name: string; role: string }])) };
  };
  const [{ data: patient }, allergies, encounters, labs, meds, documents, notes, tasks, role, auditLog] = await Promise.all([
    supabase.from("patients").select("*").eq("id", id).single(),
    supabase.from("allergies").select("*").eq("patient_id", id),
    supabase.from("encounters").select("*").eq("patient_id", id),
    supabase.from("lab_results").select("*").eq("patient_id", id),
    supabase.from("medications").select("*").eq("patient_id", id),
    // only what the timeline needs (not extracted_json / note content / transcript)
    supabase.from("documents").select("id, doc_type, status, uploaded_at").eq("patient_id", id),
    supabase.from("clinical_notes").select("id, note_type, status, created_at").eq("patient_id", id),
    supabase.from("tasks").select("*").eq("patient_id", id).order("created_at"),
    currentRole(supabase),
    currentRole(supabase).then(accessLogFor),
    logAudit({ action: "view", entityType: "patient", entityId: id, patientId: id }),
  ]);
  if (!patient) notFound();
  const accessLog = auditLog.rows;
  const userNames = auditLog.names;

  const today = new Date().toISOString().slice(0, 10);
  const activeMeds = (meds.data ?? []).filter((m) => !m.end_date || m.end_date > today);
  const items = buildTimeline({
    patientId: id,
    encounters: encounters.data ?? [],
    labs: labs.data ?? [],
    medications: meds.data ?? [],
    documents: documents.data ?? [],
    notes: notes.data ?? [],
  });
  const noteDates = Object.fromEntries((notes.data ?? []).map((n) => [n.id as string, String(n.created_at).slice(0, 10)]));
  const allergyList = allergies.data ?? [];
  const gaps = careGaps({
    today,
    encounters: encounters.data ?? [],
    medications: meds.data ?? [],
    labs: (labs.data ?? []) as TrendLab[],
    tasks: tasks.data ?? [],
  });
  const alerts = checkSafety({ patientId: id, allergies: allergyList, activeMeds, labs: labs.data ?? [] });
  const card = "card p-5";
  const chip = "flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-sm text-slate-700";

  return (
    <div className="space-y-6">
      <FocusHighlight />
      <Link href="/patients" className="text-sm text-brand-700 hover:underline">← All patients</Link>

      {typeof notice === "string" && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>
      )}

      <div className={`${card} flex flex-wrap items-center gap-4`}>
        <Avatar name={patient.name} size="lg" />
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="page-title">{patient.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <span className={chip}>{ageFromDob(patient.dob) ?? "?"} y</span>
            <span className={chip}>{patient.sex ?? "—"}</span>
            <span className={chip}>MRN {patient.mrn ?? "—"}</span>
            <span className={chip}><Phone size={13} />{patient.phone ?? "—"}</span>
            {allergyList.map((a) => (
              <span key={a.id ?? a.substance} className="badge badge-alert"><AlertTriangle size={12} /> {a.substance}</span>
            ))}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {can(role, "record_consultation") && (
          <Link href={`/patients/${id}/consult`} className="tile"><span className="tile-icon"><Mic size={18} /></span> New consultation</Link>
        )}
        {can(role, "upload") && (
          <Link href={`/patients/${id}/upload`} className="tile"><span className="tile-icon"><Upload size={18} /></span> Upload report</Link>
        )}
        {can(role, "ask") && (
          <a href="#ask" className="tile"><span className="tile-icon"><MessageSquareText size={18} /></span> Ask Medora</a>
        )}
        <PreVisitBrief patientId={id} patientName={patient.name} tile />
      </div>

      {can(role, "export_fhir") && (
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-slate-500">
          <span>{FHIR_DISCLAIMER}</span>
          <a href={`/api/fhir/${id}`} download className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Download size={14} /> Download FHIR bundle (JSON)
          </a>
        </div>
      )}

      {allergyList.length > 0 ? (
        <div id="allergies" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div><strong>Allergies: </strong>{allergyList.map((a) => `${a.substance}${a.reaction ? ` (${a.reaction})` : ""}`).join(", ")}</div>
        </div>
      ) : (
        <p className="px-1 text-sm text-slate-500">No known allergies</p>
      )}

      <div className={card}>
        <SafetyAlerts alerts={alerts} />
      </div>

      <div className={card}>
        <CareGaps gaps={gaps} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <TrendsCard patientId={id} labs={(labs.data ?? []) as TrendLab[]} />

          {can(role, "ask") && <AskMedora patientId={id} />}

          <div id="timeline" className={card}>
            <p className="eyebrow">History</p>
            <h2 className="card-title mb-3">Timeline</h2>
            <Timeline items={items} />
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          <TasksCard patientId={id} tasks={(tasks.data ?? []) as Task[]} today={today} noteDates={noteDates}
            canConfirm={can(role, "task.confirm")} canDismiss={can(role, "task.dismiss")} canComplete={can(role, "task.complete")} />

          <div className={card}>
            <p className="eyebrow">Treatment</p>
            <h2 className="card-title mb-3 flex items-center gap-2"><Pill size={16} className="text-brand-600" /> Current medications</h2>
            {activeMeds.length === 0 ? (
              <p className="text-sm text-slate-500">No active medications.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {activeMeds.map((m) => (
                  <li key={m.id} className="flex flex-col py-2">
                    <span className="font-medium text-slate-800">{m.drug_name}</span>
                    <span className="text-slate-500">{[m.dose, m.frequency].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {can(role, "view_audit") && (
            <div className={card}>
              <p className="eyebrow">Audit</p>
              <h2 className="card-title mb-3">Access log</h2>
              {accessLog.length === 0 ? (
                <p className="text-sm text-slate-500">No entries.</p>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm text-slate-700">
                  {accessLog.map((a) => {
                    const u = userNames.get(a.user_id);
                    return (
                      <li key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
                        <span className="w-full text-xs text-slate-500">{formatTime(a.created_at)}</span>
                        <span>{u?.full_name ?? "Unknown"}</span>
                        {u && <RoleBadge role={u.role} />}
                        <ActionBadge action={a.action} />
                      </li>
                    );
                  })}
                </ul>
              )}
              <Link href={`/audit?patient=${id}`} className="mt-2 inline-block text-xs text-brand-700 hover:underline">Full audit log →</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
