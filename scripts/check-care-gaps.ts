// Prints which care gaps fire for each seeded demo patient (reads the seed data, no database needed).
// Usage: npm run check:care-gaps [YYYY-MM-DD]   (default: today)
import { careGaps } from "../lib/care-gaps";
import { patients } from "./seed-data";

const today = process.argv[2] ?? new Date().toISOString().slice(0, 10);
console.log(`Care gaps as of ${today}\n`);

for (const [pi, x] of patients.entries()) {
  const gaps = careGaps({
    today,
    encounters: x.encounters.map((e, i) => ({ id: `e${pi}-${i}`, encounter_date: e.encounter_date, summary: e.summary })),
    medications: x.meds,
    labs: x.labs.map((l) => ({ ...l, document_id: null })),
    tasks: [],
  });
  console.log(`${x.p.name} (${x.p.mrn}): ${gaps.length ? `${gaps.length} gap(s)` : "no gaps"}`);
  for (const g of gaps) {
    console.log(`  [${g.severity}] ${g.rule}`);
    console.log(`     ${g.message}`);
    console.log(`     why: ${g.why}`);
    console.log(`     sources: ${g.evidence.map((e) => e.label).join("; ")}`);
  }
  console.log();
}
