import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { currentRole, currentUser } from "@/lib/roles";
import { buildBundle, stableUuid } from "@/lib/fhir";

// Doctor-only FHIR R4 export of one patient (prototype, synthetic data).
export async function GET(_req: Request, ctx: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await ctx.params;
  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!can(await currentRole(supabase), "export_fhir")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const [patient, allergies, medications, labs, notes] = await Promise.all([
    supabase.from("patients").select("id, name, dob, sex, mrn, phone").eq("id", patientId).single(),
    supabase.from("allergies").select("id, substance, reaction").eq("patient_id", patientId),
    supabase.from("medications").select("id, drug_name, dose, frequency, start_date, end_date, prescribed_by").eq("patient_id", patientId),
    supabase.from("lab_results").select("id, test_name, value, unit, ref_low, ref_high, flag, collected_date").eq("patient_id", patientId),
    supabase.from("clinical_notes").select("id, content, created_at").eq("patient_id", patientId).eq("status", "approved"),
  ]);
  if (!patient.data) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  // Only approved notes: the assessment statements are the app's only diagnosis-like records.
  const assessments = (notes.data ?? []).flatMap((n) =>
    ((n.content?.soap?.assessment ?? []) as { text: string }[]).map((s, i) => ({
      id: stableUuid(`${n.id}:assessment:${i}`),
      text: s.text,
      date: String(n.created_at).slice(0, 10),
    })),
  );

  const bundle = buildBundle({
    patient: patient.data,
    allergies: allergies.data ?? [],
    medications: medications.data ?? [],
    labs: labs.data ?? [],
    assessments,
  });

  await logAudit({ action: "fhir.export", entityType: "patient", entityId: patientId, patientId });
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/fhir+json",
      "Content-Disposition": `attachment; filename="medora-fhir-${patient.data.mrn ?? patientId}.json"`,
    },
  });
}
