import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Upload, Mic, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { buildTimeline } from "@/lib/timeline";
import { ageFromDob } from "@/lib/utils";
import Timeline from "@/components/Timeline";

export default async function PatientPage(props: PageProps<"/patients/[id]">) {
  const { id } = await props.params;
  const supabase = await createClient();

  const { data: patient } = await supabase.from("patients").select("*").eq("id", id).single();
  if (!patient) notFound();

  const [allergies, encounters, labs, meds, documents, notes] = await Promise.all([
    supabase.from("allergies").select("*").eq("patient_id", id),
    supabase.from("encounters").select("*").eq("patient_id", id),
    supabase.from("lab_results").select("*").eq("patient_id", id),
    supabase.from("medications").select("*").eq("patient_id", id),
    supabase.from("documents").select("*").eq("patient_id", id),
    supabase.from("clinical_notes").select("*").eq("patient_id", id),
  ]);

  await logAudit({ action: "view", entityType: "patient", entityId: id, patientId: id });

  const today = new Date().toISOString().slice(0, 10);
  const activeMeds = (meds.data ?? []).filter((m) => !m.end_date || m.end_date > today);
  const items = buildTimeline({
    encounters: encounters.data ?? [],
    labs: labs.data ?? [],
    medications: meds.data ?? [],
    documents: documents.data ?? [],
    notes: notes.data ?? [],
  });
  const allergyList = allergies.data ?? [];
  const card = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";

  return (
    <div className="space-y-4">
      <Link href="/patients" className="text-sm text-teal-700 hover:underline">← All patients</Link>

      <div className={`${card} flex flex-wrap items-center justify-between gap-4`}>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{patient.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-slate-500">
            <span>{ageFromDob(patient.dob) ?? "?"} y</span>
            <span>{patient.sex ?? "—"}</span>
            <span>MRN {patient.mrn ?? "—"}</span>
            <span className="flex items-center gap-1"><Phone size={13} />{patient.phone ?? "—"}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/patients/${id}/upload`} className="flex items-center gap-1.5 rounded-lg border border-teal-600 px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50">
            <Upload size={16} /> Upload report
          </Link>
          <Link href={`/patients/${id}/consult`} className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700">
            <Mic size={16} /> New consultation
          </Link>
        </div>
      </div>

      {allergyList.length > 0 ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div><strong>Allergies: </strong>{allergyList.map((a) => `${a.substance}${a.reaction ? ` (${a.reaction})` : ""}`).join(", ")}</div>
        </div>
      ) : (
        <p className="px-1 text-sm text-slate-400">No known allergies</p>
      )}

      <div className={card}>
        <h2 className="mb-3 font-semibold text-slate-900">Current medications</h2>
        {activeMeds.length === 0 ? (
          <p className="text-sm text-slate-500">No active medications.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {activeMeds.map((m) => (
              <li key={m.id} className="flex justify-between py-2">
                <span className="font-medium text-slate-800">{m.drug_name}</span>
                <span className="text-slate-500">{[m.dose, m.frequency].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={card}>
        <h2 className="mb-3 font-semibold text-slate-900">Timeline</h2>
        <Timeline items={items} />
      </div>
    </div>
  );
}
