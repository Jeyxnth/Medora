// Rule-based care gaps: what looks overdue or unmonitored in one patient's records. Pure functions, no AI.
// These are prompts for the doctor to review, not diagnoses, and they never change records.
import { canonicalName } from "./validate";
import { drugClasses, normalizeDrug } from "./safety";
import { groupSeries, trendInsights, type TrendLab } from "./trends";

export type GapEvidence = { label: string; focus?: string }; // focus = element id on the patient page timeline
export type CareGap = {
  id: string;
  severity: "attention" | "info";
  message: string;
  rule: string; // rule name
  why: string; // the exact data the rule used
  evidence: GapEvidence[];
};

type Enc = { id: string; encounter_date: string | null; summary: string | null };
type Med = { id?: string; drug_name: string; end_date?: string | null };
type TaskRow = { status: string };

export type GapInput = {
  today: string; // YYYY-MM-DD, passed in so results are deterministic
  encounters: Enc[];
  medications: Med[];
  labs: TrendLab[];
  tasks: TaskRow[];
};

const DAY = 86400000;
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

const HBA1C_TARGET = 7.0; // % general adult target; the doctor sets individual targets
const HBA1C_OVERDUE_DAYS = 180;
const RECHECK_DAYS = 90;
const KIDNEY_LAB_DAYS = 180;
const DIABETES_DRUGS = ["metformin", "glimepiride", "gliclazide", "glipizide", "sitagliptin", "vildagliptin", "pioglitazone", "empagliflozin", "dapagliflozin", "insulin"];
const KIDNEY_CLASSES = ["nsaid", "ace_inhibitor", "arb"]; // plus metformin and spironolactone below

const evLab = (l: TrendLab): GapEvidence => ({
  label: `${l.test_name} ${l.value}${l.unit ? ` ${l.unit}` : ""} (${l.collected_date})`,
  focus: `lab-${l.collected_date}`,
});
const evEnc = (e: Enc): GapEvidence => ({ label: `Visit ${e.encounter_date}`, focus: `enc-${e.id}` });
const evMed = (m: Med): GapEvidence => ({ label: `Medication: ${m.drug_name}`, focus: m.id ? `medstart-${m.id}` : undefined });

const latest = (labs: TrendLab[], canon: string) =>
  labs.filter((l) => canonicalName(l.test_name) === canon && l.collected_date && typeof l.value === "number")
    .sort((a, b) => b.collected_date!.localeCompare(a.collected_date!))[0];

const BP = /\bBP\s*(\d{2,3})\s*\/\s*(\d{2,3})/i;
const bpOf = (e: Enc) => {
  const m = BP.exec(e.summary ?? "");
  return m ? { sys: Number(m[1]), dia: Number(m[2]), text: m[0] } : null;
};

export function careGaps(input: GapInput): CareGap[] {
  const { today, encounters, labs, tasks } = input;
  const meds = input.medications.filter((m) => !m.end_date || m.end_date > today);
  const gaps: CareGap[] = [];

  // Diabetes: from a diabetes medicine, or "diabetes" in a visit summary.
  const dmMed = meds.find((m) => DIABETES_DRUGS.includes(normalizeDrug(m.drug_name)));
  const dmEnc = encounters.find((e) => /diabet/i.test(e.summary ?? ""));
  const dmBasis = dmMed ? evMed(dmMed) : dmEnc ? evEnc(dmEnc) : null;
  const dmWhy = dmMed ? `diabetes medicine ${dmMed.drug_name} is active` : dmEnc ? `visit on ${dmEnc.encounter_date} mentions diabetes` : "";

  if (dmBasis) {
    const a1c = latest(labs, "HbA1c");
    const age = a1c ? days(a1c.collected_date!, today) : null;
    if (!a1c || age! > HBA1C_OVERDUE_DAYS) {
      gaps.push({
        id: "hba1c-overdue", severity: "attention", rule: "Diabetes: HbA1c overdue",
        message: a1c
          ? `Last HbA1c was ${age} days ago (${a1c.collected_date}). Consider reviewing whether one is due.`
          : "No HbA1c result on record for a patient with diabetes. Consider reviewing whether one is due.",
        why: `Rule: a patient with diabetes should have an HbA1c in the last ${HBA1C_OVERDUE_DAYS} days. Data used: ${dmWhy}; ${a1c ? `latest HbA1c ${a1c.value}${a1c.unit ?? ""} on ${a1c.collected_date}` : "no HbA1c results"}; today is ${today}.`,
        evidence: [dmBasis, ...(a1c ? [evLab(a1c)] : [])],
      });
    } else if (a1c.value > HBA1C_TARGET && age! > RECHECK_DAYS) {
      gaps.push({
        id: "hba1c-no-recheck", severity: "attention", rule: "Diabetes: HbA1c above target, no recheck",
        message: `Last HbA1c was ${a1c.value}% (above ${HBA1C_TARGET}%) ${age} days ago with no recheck since. Consider reviewing.`,
        why: `Rule: HbA1c above ${HBA1C_TARGET}% (general target; individual targets vary) with no newer result after ${RECHECK_DAYS} days. Data used: ${dmWhy}; HbA1c ${a1c.value}% on ${a1c.collected_date}; today is ${today}.`,
        evidence: [dmBasis, evLab(a1c)],
      });
    }
  }

  // Raised blood pressure in a visit summary, with no later visit that records a BP.
  const withBp = encounters.filter((e) => e.encounter_date && bpOf(e)).sort((a, b) => a.encounter_date!.localeCompare(b.encounter_date!));
  const lastBp = withBp[withBp.length - 1];
  if (lastBp) {
    const b = bpOf(lastBp)!;
    if (b.sys >= 140 || b.dia >= 90) {
      const later = encounters.filter((e) => e.encounter_date && e.encounter_date > lastBp.encounter_date!);
      gaps.push({
        id: "bp-no-recheck", severity: "attention", rule: "Raised BP without a recheck",
        message: `${b.text} was recorded on ${lastBp.encounter_date} and no later reading is recorded${later.length ? ` (${later.length} later visit${later.length > 1 ? "s" : ""} without a BP)` : ""}. Consider reviewing.`,
        why: `Rule: a reading of 140 systolic or 90 diastolic or higher needs a later recorded reading. Data used: "${b.text}" in the summary of the visit on ${lastBp.encounter_date}; ${later.length} visit(s) after it with no BP reading. BP is read from visit summary text, so readings recorded elsewhere are not seen.`,
        evidence: [evEnc(lastBp), ...later.map(evEnc)],
      });
    }
  }

  // Kidney-sensitive medicine with no recent creatinine or eGFR.
  const kidneyMeds = meds.filter((m) => {
    const n = normalizeDrug(m.drug_name);
    return n !== "aspirin" && (n === "metformin" || n === "spironolactone" || KIDNEY_CLASSES.some((c) => drugClasses(m.drug_name).has(c)));
  });
  if (kidneyMeds.length) {
    const newest = ["Creatinine", "eGFR"].map((t) => latest(labs, t)).filter((l): l is TrendLab => !!l)
      .sort((a, b) => b.collected_date!.localeCompare(a.collected_date!))[0];
    const age = newest ? days(newest.collected_date!, today) : null;
    if (!newest || age! > KIDNEY_LAB_DAYS) {
      const names = kidneyMeds.map((m) => m.drug_name).join(", ");
      gaps.push({
        id: "kidney-labs-overdue", severity: "attention", rule: "Kidney-sensitive medicine without recent kidney tests",
        message: `${names} can need kidney monitoring, and ${newest ? `the last creatinine or eGFR was ${age} days ago (${newest.collected_date})` : "no creatinine or eGFR is on record"}. Consider reviewing.`,
        why: `Rule: an active metformin, NSAID, ACE inhibitor, ARB or spironolactone needs a creatinine or eGFR in the last ${KIDNEY_LAB_DAYS} days. Data used: active ${names}; ${newest ? `newest of creatinine/eGFR is ${newest.test_name} ${newest.value} on ${newest.collected_date}` : "no creatinine or eGFR results"}; today is ${today}.`,
        evidence: [...kidneyMeds.map(evMed), ...(newest ? [evLab(newest)] : [])],
      });
    }
  }

  // Worsening lab trend with no visit on or after the latest result and no open task.
  const series = groupSeries(labs);
  const openTask = tasks.some((t) => t.status === "open" || t.status === "draft");
  const trendTests = new Set<string>();
  for (const ins of trendInsights(series)) {
    const list = series.get(ins.test)!;
    const last = list[list.length - 1];
    const after = encounters.filter((e) => e.encounter_date && e.encounter_date >= last.collected_date!);
    if (after.length || openTask) continue;
    trendTests.add(ins.test);
    gaps.push({
      id: `trend-no-followup:${ins.test}`, severity: "attention", rule: "Worsening trend without follow-up",
      message: `${ins.text}, with no visit on or after the latest result and no open task. Consider reviewing.`,
      why: `Rule: results moving in the worse direction over 3 or more tests, and no visit dated on or after the latest result and no open or draft task. Data used: ${list.slice(-3).map((l) => `${l.value} (${l.collected_date})`).join(", ")}; 0 later visits; 0 open tasks.`,
      evidence: list.slice(-3).map(evLab),
    });
  }

  // Any other out-of-range latest result not repeated for 90+ days (HbA1c has its own rule above).
  for (const [test, list] of series) {
    if (canonicalName(test) === "HbA1c" || trendTests.has(test)) continue;
    const last = list[list.length - 1];
    const abnormal = (last.flag && last.flag.toLowerCase() !== "normal") ||
      (last.ref_low != null && last.value < last.ref_low) || (last.ref_high != null && last.value > last.ref_high);
    const age = days(last.collected_date!, today);
    if (!abnormal || age <= RECHECK_DAYS) continue;
    gaps.push({
      id: `abnormal-no-recheck:${test}`, severity: "info", rule: "Abnormal result not repeated",
      message: `${test} was out of range (${last.value}${last.unit ? ` ${last.unit}` : ""}) on ${last.collected_date}, ${age} days ago, with no newer result. Consider reviewing whether a repeat is due.`,
      why: `Rule: the latest result is out of its reference range and older than ${RECHECK_DAYS} days. Data used: ${test} ${last.value} on ${last.collected_date}${last.ref_low != null || last.ref_high != null ? ` (range ${last.ref_low ?? ""}-${last.ref_high ?? ""})` : ""}; no later result; today is ${today}.`,
      evidence: [evLab(last)],
    });
  }

  return gaps;
}
