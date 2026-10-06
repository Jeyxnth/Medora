import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";

config({ path: ".env.local" });

const DIR = "sample-docs";
const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fmtRef(lo: number | null, hi: number | null) {
  if (lo != null && hi != null) return `${lo}-${hi}`;
  if (lo != null) return `>${lo}`;
  if (hi != null) return `<${hi}`;
  return "-";
}

async function main() {
  // imported after dotenv so env vars are set before lib code reads them
  const { extractDocument } = await import("../lib/extract");
  const { validateExtraction } = await import("../lib/validate");

  const files = fs.readdirSync(DIR).filter((f) => MIME[path.extname(f).toLowerCase()]).sort();
  fs.mkdirSync(path.join(DIR, "out"), { recursive: true });

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    console.log(`\n=== ${f}`);
    const t0 = Date.now();
    try {
      const raw = await extractDocument(fs.readFileSync(path.join(DIR, f)), MIME[path.extname(f).toLowerCase()]);
      const v = validateExtraction(raw);
      console.log(`type: ${v.doc_type} | date: ${v.document_date ?? "-"} | patient: ${v.patient_name ?? "-"}`);
      for (const r of v.lab_results) {
        const issues = r.issues.length ? `  ${r.issues.join("; ")}` : "";
        console.log(`  ${(r.canonical_name ?? r.test_name).padEnd(20)} ${String(r.value ?? r.value_text).padStart(7)} ${(r.unit ?? "").padEnd(14)} ref ${fmtRef(r.ref_low, r.ref_high).padEnd(10)} ${r.flag ?? "-"}  ${r.status}${issues}`);
      }
      for (const m of v.medications) {
        const issues = m.issues.length ? `  ${m.issues.join("; ")}` : "";
        console.log(`  ${m.drug_name.padEnd(20)} ${(m.dose ?? "-").padEnd(10)} ${(m.frequency ?? "-").padEnd(18)} ${(m.duration ?? "-").padEnd(10)} ${m.status}${issues}`);
      }
      fs.writeFileSync(path.join(DIR, "out", `${f}.json`), JSON.stringify(v, null, 2));
    } catch (e) {
      console.log(`  FAILED: ${(e as Error).message}`);
    }
    console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    if (i < files.length - 1) await sleep(5000);
  }
}

main();
