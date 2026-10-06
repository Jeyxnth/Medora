import { createClient } from "@/lib/supabase/server";
import PatientList from "@/components/PatientList";

export default async function PatientsPage() {
  const supabase = await createClient();
  const { data: patients } = await supabase.from("patients").select("id, name, dob, sex, mrn").order("name");
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-slate-900">Patients</h1>
      <PatientList patients={patients ?? []} />
    </div>
  );
}
