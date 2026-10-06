// Deterministic lab trend helpers. Pure functions, no AI.

export type TrendLab = {
  test_name: string;
  value: number;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  flag: string | null;
  collected_date: string | null;
  document_id: string | null;
};

export type Insight = { test: string; text: string };

// Which direction of change is clinically worse. Tests not listed get no insight.
const HIGHER_IS_WORSE = ["HbA1c", "Creatinine", "Blood Urea", "Potassium", "Glucose (Fasting)", "Total Cholesterol", "LDL Cholesterol", "Triglycerides", "Urine ACR"];
const LOWER_IS_WORSE = ["eGFR", "Hemoglobin", "HDL Cholesterol"];

export const DEFAULT_TESTS = ["HbA1c", "Creatinine", "eGFR"];

// test name -> results sorted by date ascending
export function groupSeries(labs: TrendLab[]): Map<string, TrendLab[]> {
  const out = new Map<string, TrendLab[]>();
  for (const l of labs) {
    if (!l.collected_date || typeof l.value !== "number") continue;
    out.set(l.test_name, [...(out.get(l.test_name) ?? []), l]);
  }
  for (const list of out.values()) list.sort((a, b) => a.collected_date!.localeCompare(b.collected_date!));
  return out;
}

const DAY = 86400000;

// An insight needs 3+ results whose last 3 consecutive values all move in the worse direction.
// The streak is extended backwards for as long as the movement stays in that direction.
export function trendInsights(series: Map<string, TrendLab[]>): Insight[] {
  const out: Insight[] = [];
  for (const [test, list] of series) {
    const dir = HIGHER_IS_WORSE.includes(test) ? 1 : LOWER_IS_WORSE.includes(test) ? -1 : 0;
    if (!dir || list.length < 3) continue;
    const worse = (i: number) => (list[i].value - list[i - 1].value) * dir > 0;
    const n = list.length;
    if (!worse(n - 1) || !worse(n - 2)) continue;

    let start = n - 3;
    while (start > 0 && worse(start)) start--;
    const first = list[start];
    const last = list[n - 1];
    const count = n - start;
    const pct = first.value !== 0 ? Math.round(((last.value - first.value) / Math.abs(first.value)) * 100) : null;
    const days = (Date.parse(last.collected_date!) - Date.parse(first.collected_date!)) / DAY;
    const months = Math.round(days / 30.44);
    const span = months >= 1 ? `${months} month${months > 1 ? "s" : ""}` : `${Math.round(days)} days`;
    const unit = last.unit ? ` ${last.unit}` : "";
    out.push({
      test,
      text: `${test} ${dir > 0 ? "rising" : "falling"} over ${count} results: ${first.value} -> ${last.value}${unit}${pct != null ? ` (${pct > 0 ? "+" : ""}${pct}%)` : ""} across ${span}`,
    });
  }
  return out;
}
