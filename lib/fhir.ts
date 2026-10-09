// FHIR R4 Bundle (type "collection") built from Medora records. Plain TypeScript, no libraries.
// Prototype for the demo: synthetic data only, not ABDM certified.
import { createHash } from "node:crypto";
import { canonicalName } from "./validate";

export const FHIR_DISCLAIMER = "Prototype FHIR R4 export on synthetic data. Not ABDM certified.";

// Stable synthetic UUID from any seed string (same input, same id). Used where a record has no id of its own.
export function stableUuid(seed: string): string {
  const h = createHash("sha1").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export type FhirInput = {
  patient: { id: string; name: string; dob: string | null; sex: string | null; mrn: string | null; phone: string | null };
  allergies: { id: string; substance: string | null; reaction: string | null }[];
  medications: { id: string; drug_name: string; dose: string | null; frequency: string | null; start_date: string | null; end_date: string | null; prescribed_by: string | null }[];
  labs: { id: string; test_name: string; value: number | null; unit: string | null; ref_low: number | null; ref_high: number | null; flag: string | null; collected_date: string | null }[];
  // Assessment statements of approved clinical notes. The records hold no coded diagnoses, so these are the only Conditions.
  assessments: { id: string; text: string; date: string | null }[];
};

type Resource = { resourceType: string; id: string; [k: string]: unknown };

// LOINC codes only where the code is certain. Everything else is exported with code.text only.
const LOINC: Record<string, { code: string; display: string }> = {
  hba1c: { code: "4548-4", display: "Hemoglobin A1c/Hemoglobin.total in Blood" },
  creatinine: { code: "2160-0", display: "Creatinine [Mass/volume] in Serum or Plasma" },
  potassium: { code: "2823-3", display: "Potassium [Moles/volume] in Serum or Plasma" },
  sodium: { code: "2951-2", display: "Sodium [Moles/volume] in Serum or Plasma" },
  hemoglobin: { code: "718-7", display: "Hemoglobin [Mass/volume] in Blood" },
  "total cholesterol": { code: "2093-3", display: "Cholesterol [Mass/volume] in Serum or Plasma" },
  "hdl cholesterol": { code: "2085-9", display: "Cholesterol in HDL [Mass/volume] in Serum or Plasma" },
  triglycerides: { code: "2571-8", display: "Triglyceride [Mass/volume] in Serum or Plasma" },
  tsh: { code: "3016-3", display: "Thyrotropin [Units/volume] in Serum or Plasma" },
  ferritin: { code: "2276-4", display: "Ferritin [Mass/volume] in Serum or Plasma" },
};

// Display unit -> UCUM code. Units not listed are exported with the display unit only (no code).
const UCUM: Record<string, string> = {
  "%": "%", "mg/dL": "mg/dL", "g/dL": "g/dL", "mmol/L": "mmol/L", "ng/mL": "ng/mL",
  "mIU/L": "m[IU]/L", "IU/mL": "[IU]/mL", "mL/min/1.73m2": "mL/min/{1.73_m2}",
};

const ref = (r: Resource) => ({ reference: `urn:uuid:${r.id}` });
const day = (d: string | null) => d ?? undefined;

function loincFor(testName: string) {
  const key = (canonicalName(testName) ?? testName).trim().toLowerCase();
  return LOINC[key];
}

const quantity = (value: number, unit: string | null) => ({
  value,
  // a UCUM code with an annotation (like {1.73_m2}) should also appear in the display unit
  ...(unit ? { unit: UCUM[unit]?.includes("{") ? UCUM[unit] : unit } : {}),
  ...(unit && UCUM[unit] ? { system: "http://unitsofmeasure.org", code: UCUM[unit] } : {}),
});

const INTERPRETATION: Record<string, { code: string; display: string }> = {
  high: { code: "H", display: "High" },
  low: { code: "L", display: "Low" },
  normal: { code: "N", display: "Normal" },
};

export function buildBundle(input: FhirInput, now = new Date()): Record<string, unknown> {
  const { patient } = input;
  const today = now.toISOString().slice(0, 10);
  const parts = patient.name.trim().split(/\s+/);
  const family = parts.length > 1 ? parts[parts.length - 1] : undefined;

  const gender = patient.sex?.toUpperCase().startsWith("F") ? "female" : patient.sex?.toUpperCase().startsWith("M") ? "male" : "unknown";
  const pat: Resource = {
    resourceType: "Patient",
    id: patient.id,
    ...(patient.mrn ? { identifier: [{ system: "urn:example:medora:mrn", value: patient.mrn }] } : {}),
    name: [{ text: patient.name, ...(family ? { family, given: parts.slice(0, -1) } : {}) }],
    gender,
    ...(patient.dob ? { birthDate: patient.dob } : {}),
    ...(patient.phone ? { telecom: [{ system: "phone", value: patient.phone }] } : {}),
  };

  const resources: Resource[] = [pat];

  for (const a of input.allergies) {
    if (!a.substance) continue;
    resources.push({
      resourceType: "AllergyIntolerance",
      id: a.id,
      clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", code: "active" }] },
      code: { text: a.substance },
      patient: ref(pat),
      ...(a.reaction ? { reaction: [{ manifestation: [{ text: a.reaction }] }] } : {}),
    });
  }

  for (const c of input.assessments) {
    resources.push({
      resourceType: "Condition",
      id: c.id,
      code: { text: c.text },
      subject: ref(pat),
      ...(c.date ? { recordedDate: c.date } : {}),
    });
  }

  for (const m of input.medications) {
    const dosage = [m.dose, m.frequency].filter(Boolean).join(" ");
    resources.push({
      resourceType: "MedicationRequest",
      id: m.id,
      status: m.end_date && m.end_date <= today ? "stopped" : "active",
      intent: "order",
      medicationCodeableConcept: { text: m.drug_name },
      subject: ref(pat),
      ...(m.start_date ? { authoredOn: m.start_date } : {}),
      ...(m.prescribed_by ? { requester: { display: m.prescribed_by } } : {}),
      ...(dosage ? { dosageInstruction: [{ text: dosage }] } : {}),
    });
  }

  for (const l of input.labs) {
    if (typeof l.value !== "number") continue;
    const loinc = loincFor(l.test_name);
    const flag = INTERPRETATION[(l.flag ?? "").toLowerCase()];
    resources.push({
      resourceType: "Observation",
      id: l.id,
      status: "final",
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "laboratory", display: "Laboratory" }] }],
      code: {
        ...(loinc ? { coding: [{ system: "http://loinc.org", code: loinc.code, display: loinc.display }] } : {}),
        text: l.test_name,
      },
      subject: ref(pat),
      ...(l.collected_date ? { effectiveDateTime: day(l.collected_date) } : {}),
      valueQuantity: quantity(l.value, l.unit),
      ...(flag ? { interpretation: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation", ...flag }] }] } : {}),
      ...(l.ref_low != null || l.ref_high != null
        ? { referenceRange: [{ ...(l.ref_low != null ? { low: quantity(l.ref_low, l.unit) } : {}), ...(l.ref_high != null ? { high: quantity(l.ref_high, l.unit) } : {}) }] }
        : {}),
    });
  }

  return {
    resourceType: "Bundle",
    id: `medora-${patient.id}`,
    meta: { tag: [{ system: "urn:example:medora:disclaimer", code: "prototype", display: FHIR_DISCLAIMER }] },
    type: "collection",
    timestamp: now.toISOString(),
    entry: resources.map((r) => ({ fullUrl: `urn:uuid:${r.id}`, resource: r })),
  };
}
