import { createClient } from "@/lib/supabase/server";
import PatientList from "@/components/PatientList";

export default async function PatientsPage(props: PageProps<"/patients">) {
  const { notice } = await props.searchParams;
  const supabase = await createClient();
  const { data: patients } = await supabase.from("patients").select("id, name, dob, sex, mrn").order("name");
  return (
    <div>
      {typeof notice === "string" && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{notice}</p>
      )}
      <h1 className="mb-4 text-2xl font-semibold text-slate-900">Patients</h1>
      <PatientList patients={patients ?? []} />
    </div>
  );
}
