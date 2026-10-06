import type { Extraction, LabResult, Medication } from "./extract";

type Spec = { name: string; unit: string; min: number; max: number; aliases: string[] };

const TESTS: Spec[] = [
  { name: "HbA1c", unit: "%", min: 3, max: 20, aliases: ["hba1c", "hb a1c", "glycated hemoglobin", "glycosylated hemoglobin", "hemoglobin a1c", "a1c"] },
  { name: "Glucose (Fasting)", unit: "mg/dL", min: 20, max: 800, aliases: ["glucose fasting", "fasting glucose", "fasting blood sugar", "fbs", "fasting glucose", "fpg", "glucose"] },
  { name: "Creatinine", unit: "mg/dL", min: 0.1, max: 15, aliases: ["creatinine", "creatinine serum", "serum creatinine", "s creatinine"] },
  { name: "eGFR", unit: "mL/min/1.73m2", min: 1, max: 150, aliases: ["egfr", "egfr ckd epi", "estimated gfr", "gfr"] },
  { name: "Blood Urea", unit: "mg/dL", min: 2, max: 300, aliases: ["blood urea", "urea"] },
  { name: "Sodium", unit: "mmol/L", min: 100, max: 180, aliases: ["sodium", "serum sodium", "na"] },
  { name: "Potassium", unit: "mmol/L", min: 1, max: 9, aliases: ["potassium", "serum potassium", "k"] },
  { name: "Hemoglobin", unit: "g/dL", min: 2, max: 25, aliases: ["hemoglobin", "haemoglobin", "hb", "hgb"] },
  { name: "Total Cholesterol", unit: "mg/dL", min: 50, max: 600, aliases: ["total cholesterol", "cholesterol total", "cholesterol", "serum cholesterol"] },
  { name: "LDL Cholesterol", unit: "mg/dL", min: 10, max: 400, aliases: ["ldl cholesterol", "ldl", "ldl c", "cholesterol ldl"] },
  { name: "HDL Cholesterol", unit: "mg/dL", min: 5, max: 150, aliases: ["hdl cholesterol", "hdl", "hdl c", "cholesterol hdl"] },
  { name: "Triglycerides", unit: "mg/dL", min: 20, max: 2000, aliases: ["triglycerides", "triglyceride", "tg", "serum triglycerides"] },
  { name: "Urine ACR", unit: "mg/g", min: 0, max: 5000, aliases: ["urine acr", "uacr", "acr", "albumin creatinine ratio", "urine albumin creatinine ratio"] },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const normUnit = (s: string) => s.toLowerCase().replace(/²/g, "2").replace(/[\s*]/g, "");

const BY_ALIAS = new Map<string, Spec>();
for (const t of TESTS) for (const a of [t.name, ...t.aliases]) BY_ALIAS.set(norm(a), t);

const QUALIFIERS = new Set(["serum", "plasma", "blood", "s"]);

// lookup order: full name, then without parentheses, then without qualifier words
function findSpec(name: string): Spec | undefined {
  const noParens = norm(name.replace(/\([^)]*\)/g, " "));
  const noQualifiers = noParens.split(" ").filter((w) => !QUALIFIERS.has(w)).join(" ");
  return BY_ALIAS.get(norm(name)) ?? BY_ALIAS.get(noParens) ?? BY_ALIAS.get(noQualifiers);
}

export const canonicalName = (name: string): string | null => findSpec(name)?.name ?? null;

export function computeFlag(value: number | null, lo: number | null, hi: number | null): Flag {
  if (typeof value !== "number" || Number.isNaN(value) || (lo == null && hi == null)) return null;
  return lo != null && value < lo ? "L" : hi != null && value > hi ? "H" : "N";
}

export type Flag = "H" | "L" | "N" | null;
export type Status = "ok" | "check";
export type ValidatedLab = LabResult & { canonical_name: string | null; flag: Flag; issues: string[]; status: Status };
export type ValidatedMed = Medication & { issues: string[]; status: Status };
export type ValidatedExtraction = Omit<Extraction, "lab_results" | "medications"> & {
  lab_results: ValidatedLab[];
  medications: ValidatedMed[];
};

const status = (issues: string[]): Status => (issues.length ? "check" : "ok");

export function validateLab(r: LabResult): ValidatedLab {
  const spec = findSpec(r.test_name);
  const issues: string[] = [];
  if (!spec) issues.push("unknown test name");

  let flag: Flag = null;
  if (typeof r.value !== "number" || Number.isNaN(r.value)) {
    issues.push(`value missing or non-numeric ("${r.value_text ?? ""}")`);
  } else {
    if (spec && (r.value < spec.min || r.value > spec.max)) issues.push(`value outside plausible range ${spec.min}-${spec.max}`);
    flag = computeFlag(r.value, r.ref_low, r.ref_high);
  }

  if (spec && r.unit && normUnit(r.unit) !== normUnit(spec.unit)) issues.push(`unit "${r.unit}" differs from expected "${spec.unit}"`);

  const printed = r.printed_flag?.trim().toLowerCase();
  if (printed && flag) {
    const p = printed.startsWith("h") ? "H" : printed.startsWith("l") ? "L" : printed.startsWith("n") ? "N" : null;
    if (p && p !== flag) issues.push(`computed flag ${flag} differs from printed flag ${r.printed_flag}`);
  }
  if (r.confidence === "low") issues.push("low confidence");

  return { ...r, canonical_name: spec?.name ?? null, flag, issues, status: status(issues) };
}

export function validateMed(m: Medication): ValidatedMed {
  const issues: string[] = [];
  if (!m.dose?.trim()) issues.push("dose missing");
  if (!m.frequency?.trim()) issues.push("frequency missing");
  if (m.confidence === "low") issues.push("low confidence");
  return { ...m, issues, status: status(issues) };
}

export function validateExtraction(x: Extraction): ValidatedExtraction {
  return {
    ...x,
    lab_results: (x.lab_results ?? []).map(validateLab),
    medications: (x.medications ?? []).map(validateMed),
  };
}
