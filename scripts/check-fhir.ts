// Builds a FHIR bundle for each seeded demo patient (no database needed), checks it, and tries the public HAPI validator.
// Usage: npm run fhir:check [--offline]
import { buildBundle, stableUuid } from "../lib/fhir";
import { patients } from "./seed-data";

type Entry = { fullUrl: string; resource: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
const offline = process.argv.includes("--offline");
const VALIDATOR = "https://hapi.fhir.org/baseR4/Bundle/$validate"; // public HAPI test server; synthetic data only

function check(bundle: Record<string, any>): string[] { // eslint-disable-line @typescript-eslint/no-explicit-any
  const errs: string[] = [];
  if (bundle.resourceType !== "Bundle") errs.push("resourceType is not Bundle");
  if (bundle.type !== "collection") errs.push("type is not collection");
  if (!bundle.meta?.tag?.some((t: { display?: string }) => t.display?.includes("Not ABDM certified"))) errs.push("disclaimer tag missing");
  const entries: Entry[] = bundle.entry ?? [];
  const urls = new Set(entries.map((e) => e.fullUrl));
  if (urls.size !== entries.length) errs.push("duplicate fullUrl");

  for (const { fullUrl, resource: r } of entries) {
    const at = `${r.resourceType}/${r.id}`;
    if (!r.resourceType) errs.push(`${fullUrl}: resourceType missing`);
    if (fullUrl !== `urn:uuid:${r.id}`) errs.push(`${at}: fullUrl does not match id`);
    const need: Record<string, string[]> = {
      Patient: ["name", "gender"],
      AllergyIntolerance: ["code", "patient"],
      Condition: ["code", "subject"],
      MedicationRequest: ["status", "intent", "medicationCodeableConcept", "subject"],
      Observation: ["status", "code", "subject", "valueQuantity"],
    };
    for (const f of need[r.resourceType] ?? [`<unknown type ${r.resourceType}>`]) if (r[f] === undefined) errs.push(`${at}: ${f} missing`);
    if (r.resourceType === "Observation") {
      if (typeof r.valueQuantity?.value !== "number") errs.push(`${at}: valueQuantity.value is not a number`);
      if (!r.valueQuantity?.unit) errs.push(`${at}: unit missing`);
    }
    // every reference must point at an entry in this bundle
    for (const key of ["subject", "patient"]) {
      const ref = r[key]?.reference;
      if (ref && !urls.has(ref)) errs.push(`${at}: ${key} reference ${ref} does not resolve`);
    }
  }
  return errs;
}

async function remote(bundle: unknown): Promise<string> {
  try {
    const res = await fetch(VALIDATOR, {
      method: "POST", headers: { "Content-Type": "application/fhir+json", Accept: "application/fhir+json" },
      body: JSON.stringify(bundle), signal: AbortSignal.timeout(60000),
    });
    const out = (await res.json().catch(() => null)) as { issue?: { severity: string; diagnostics?: string; details?: { text?: string }; expression?: string[] }[] } | null;
    if (!out?.issue) return `validator answered HTTP ${res.status} without an OperationOutcome`;
    const by = (s: string) => out.issue!.filter((i) => i.severity === s);
    const text = (i: { diagnostics?: string; details?: { text?: string } }) => i.details?.text ?? i.diagnostics ?? "";
    // Known, expected warnings are only counted: no narrative, no performer, LOINC not loaded on the test server.
    const noise = /dom-6|should have a performer|CodeSystem is unknown/;
    const warnings = by("warning");
    const lines = [`HTTP ${res.status}: ${by("error").length} error(s), ${warnings.length} warning(s) (${warnings.filter((w) => noise.test(text(w))).length} expected: narrative, performer, LOINC not loaded there)`];
    for (const i of [...by("error"), ...warnings.filter((w) => !noise.test(text(w)))].slice(0, 12)) {
      lines.push(`    ${i.severity}: ${text(i)} ${i.expression ? `@ ${i.expression[0]}` : ""}`.trimEnd());
    }
    return lines.join("\n");
  } catch (e) {
    return `validator not reachable (${(e as Error).name}); structural check above is all that ran`;
  }
}

async function main() {
  let failed = 0;
  for (const x of patients) {
    const id = (s: string) => stableUuid(`${x.p.mrn}:${s}`);
    const bundle = buildBundle({
      patient: { id: id("patient"), ...x.p },
      allergies: x.allergies.map((a, i) => ({ id: id(`allergy:${i}`), ...a })),
      medications: x.meds.map((m, i) => ({ id: id(`med:${i}`), end_date: null, prescribed_by: "Dr. Anita Rao", ...m })) as never,
      labs: x.labs.map((l, i) => ({ id: id(`lab:${i}`), ...l })),
      assessments: [],
    }, new Date("2026-10-10T00:00:00Z"));

    const errs = check(bundle);
    const entries = (bundle.entry as Entry[]).length;
    console.log(`${x.p.name} (${x.p.mrn}) gender=${(bundle.entry as Entry[])[0].resource.gender}: ${entries} resources, ${errs.length ? `${errs.length} PROBLEM(S)` : "structure OK"}`);
    for (const e of errs) console.log(`  - ${e}`);
    failed += errs.length;
    if (!offline) console.log(`  validator: ${await remote(bundle)}`);
  }
  if (failed) process.exit(1);
}
main();
