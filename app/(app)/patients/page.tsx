import { createClient } from "@/lib/supabase/server";
import PatientList from "@/components/PatientList";

export default async function PatientsPage(props: PageProps<"/patients">) {
  const { notice } = await props.searchParams;
  const supabase = await createClient();
  const [{ data: patients }, { data: allergies }, { data: encounters }] = await Promise.all([
    supabase.from("patients").select("id, name, dob, sex, mrn").order("name"),
    supabase.from("allergies").select("patient_id, substance"),
    supabase.from("encounters").select("patient_id, encounter_date"),
  ]);

  const allergyMap: Record<string, string[]> = {};
  for (const a of allergies ?? []) if (a.patient_id && a.substance) (allergyMap[a.patient_id] ??= []).push(a.substance);
  const lastMap: Record<string, string> = {};
  for (const e of encounters ?? []) {
    if (e.patient_id && e.encounter_date && e.encounter_date > (lastMap[e.patient_id] ?? "")) lastMap[e.patient_id] = e.encounter_date;
  }

  return (
    <div>
      {typeof notice === "string" && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{notice}</p>
      )}
      <h1 className="mb-4 text-2xl font-semibold text-slate-900">Patients</h1>
      <PatientList patients={(patients ?? []).map((p) => ({ ...p, allergies: allergyMap[p.id] ?? [], lastVisit: lastMap[p.id] ?? null }))} />
    </div>
  );
}
