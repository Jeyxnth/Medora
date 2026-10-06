import type { SupabaseClient } from "@supabase/supabase-js";
import type { Allergy, Med, SafetyLab } from "./safety";

// Everything checkSafety needs for one patient: allergies, active meds, labs.
export async function loadSafetyContext(supabase: SupabaseClient, patientId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const [allergies, meds, labs] = await Promise.all([
    supabase.from("allergies").select("substance, reaction").eq("patient_id", patientId),
    supabase.from("medications").select("drug_name, dose, frequency, end_date").eq("patient_id", patientId),
    supabase.from("lab_results").select("test_name, value, unit, collected_date, document_id").eq("patient_id", patientId),
  ]);
  return {
    allergies: (allergies.data ?? []) as Allergy[],
    activeMeds: (meds.data ?? [])
      .filter((m) => !m.end_date || m.end_date > today)
      .map((m) => ({ drug_name: m.drug_name, dose: m.dose, frequency: m.frequency })) as Med[],
    labs: (labs.data ?? []) as SafetyLab[],
  };
}
