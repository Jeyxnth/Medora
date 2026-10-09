import { knownDrugNames, normalizeDrug } from "./safety";

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9+ ]/g, " ").replace(/\s+/g, " ").trim();

// Close matches for a possibly misread drug name, from the patient's current medicines first, then the known list.
// Only suggests; never replaces. Returns nothing when the name already is an exact known name.
export function suggestDrugs(name: string, patientMeds: string[], max = 3): string[] {
  const q = clean(normalizeDrug(name) || name);
  if (q.length < 3 || /^illegible$/.test(q)) return [];
  const known = knownDrugNames().map(clean);
  const mine = patientMeds.map((m) => ({ shown: m, key: clean(normalizeDrug(m)) }));
  if (known.includes(q) || mine.some((m) => m.key === q)) return [];

  const scored: { shown: string; d: number; own: boolean }[] = [];
  const near = (key: string) => {
    const d = distance(q, key);
    return d <= Math.max(1, Math.floor(Math.max(q.length, key.length) / 4)) ? d : null; // about 1 error per 4 letters
  };
  for (const m of mine) { const d = near(m.key); if (d !== null) scored.push({ shown: m.shown, d, own: true }); }
  for (const k of known) { const d = near(k); if (d !== null) scored.push({ shown: k, d, own: false }); }
  return scored
    .sort((a, b) => a.d - b.d || Number(b.own) - Number(a.own))
    .map((s) => s.shown)
    .filter((v, i, all) => all.findIndex((x) => clean(normalizeDrug(x)) === clean(normalizeDrug(v))) === i)
    .slice(0, max);
}
