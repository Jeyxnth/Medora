import { createClient } from "@/lib/supabase/server";
import { ageFromDob } from "@/lib/utils";
import { formatRange } from "@/lib/timeline";

export type Source = {
  id: string;
  kind: "patient" | "allergy" | "encounter" | "medication" | "lab" | "note" | "document";
  label: string; // chip label, e.g. "Lab 2026-10-03"
  text: string; // plain body of the record, used to verify numbers
  date: string | null;
  href: string;
  focus?: string; // DOM id on the patient page to scroll to and flash (instead of navigating)
};

const MAX_CHARS = 100_000; // about 25k tokens

const FLAG = { high: "H", low: "L" } as Record<string, string>;

// Approved records of one patient as one line per item, each with a short source id. Drafts are never included.
export async function buildPatientContext(patientId: string) {
  const supabase = await createClient();
  const [patient, allergies, encounters, meds, labs, notes, docs] = await Promise.all([
    supabase.from("patients").select("name, dob, sex").eq("id", patientId).single(),
    supabase.from("allergies").select("substance, reaction").eq("patient_id", patientId),
    supabase.from("encounters").select("*").eq("patient_id", patientId).order("encounter_date"),
    supabase.from("medications").select("*").eq("patient_id", patientId).order("start_date"),
    supabase.from("lab_results").select("*").eq("patient_id", patientId).order("collected_date"),
    supabase.from("clinical_notes").select("*").eq("patient_id", patientId).eq("status", "approved").order("created_at"),
    supabase.from("documents").select("*").eq("patient_id", patientId).eq("status", "approved").order("uploaded_at"),
  ]);

  const base = `/patients/${patientId}`;
  const timeline = `${base}#timeline`;
  const sources = new Map<string, Source>();
  const lines = new Map<string, string>();
  const n: Record<string, number> = {};
  const add = (letter: string, s: Omit<Source, "id">, line: (id: string) => string) => {
    n[letter] = (n[letter] ?? 0) + 1;
    const id = `${letter}${n[letter]}`;
    sources.set(id, { id, ...s });
    lines.set(id, line(id));
    return id;
  };

  const p = patient.data;
  if (p) {
    const text = `${p.name}, ${ageFromDob(p.dob) ?? "age unknown"} y, ${p.sex ?? "sex unknown"}`;
    add("P", { kind: "patient", label: "Patient", text, date: null, href: base }, (id) => `${id} | patient | ${text}`);
  }

  for (const a of allergies.data ?? []) {
    const text = [a.substance, a.reaction].filter(Boolean).join(" | ");
    add("A", { kind: "allergy", label: "Allergy", text, date: null, href: timeline, focus: "allergies" }, (id) => `${id} | allergy | ${text}`);
  }

  // Documents first so labs can point at them.
  const docIds = new Map<string, string>();
  for (const d of docs.data ?? []) {
    const x = d.extracted_json as { document_date?: string | null; lab_name?: string | null; prescriber?: string | null } | null;
    const date = x?.document_date ?? String(d.uploaded_at).slice(0, 10);
    const text = [d.doc_type, date, x?.lab_name ?? x?.prescriber].filter(Boolean).join(" | ");
    const id = add("D", { kind: "document", label: `Document ${date}`, text, date, href: `${base}/documents/${d.id}` }, (i) => `${i} | document | ${text}`);
    docIds.set(d.id, id);
  }

  for (const m of meds.data ?? []) {
    const today = new Date().toISOString().slice(0, 10);
    const active = !m.end_date || m.end_date > today;
    const text = `${m.drug_name} ${[m.dose, m.frequency].filter(Boolean).join(" ")} | ${m.start_date ?? "?"} to ${active ? "present" : m.end_date}`;
    add("M", { kind: "medication", label: `Medication ${m.drug_name}`, text, date: m.start_date, href: timeline, focus: `medstart-${m.id}` }, (id) => `${id} | medication | ${text}`);
  }

  for (const l of labs.data ?? []) {
    const flag = FLAG[String(l.flag ?? "").toLowerCase()];
    const range = formatRange(l);
    const text = `${l.test_name} ${l.value} ${l.unit ?? ""}`.trim() + (range !== "-" ? ` (ref ${range})` : "") + (flag ? ` ${flag}` : "");
    const doc = l.document_id ? docIds.get(l.document_id) : undefined;
    add("L", {
      kind: "lab", label: `Lab ${l.collected_date ?? ""}`.trim(), text, date: l.collected_date,
      href: l.document_id ? `${base}/documents/${l.document_id}` : timeline,
      focus: l.document_id || !l.collected_date ? undefined : `lab-${l.collected_date}`,
    }, (id) => `${id} | lab | ${l.collected_date} | ${text}${doc ? ` | doc ${doc}` : ""}`);
  }

  const encDate = new Map((encounters.data ?? []).map((e) => [e.id, e.encounter_date as string]));
  for (const nt of notes.data ?? []) {
    const date = (nt.encounter_id && encDate.get(nt.encounter_id)) || String(nt.created_at).slice(0, 10);
    const soap = (nt.content?.soap ?? {}) as Record<string, { text: string }[]>;
    const part = (k: string, key: string) => (soap[key]?.length ? `${k}: ${soap[key].map((s) => s.text).join("; ")}` : "");
    const text = [part("S", "subjective"), part("O", "objective"), part("A", "assessment"), part("P", "plan")].filter(Boolean).join(" | ");
    add("N", { kind: "note", label: `Note ${date}`, text, date, href: `${base}/notes/${nt.id}` }, (id) => `${id} | note | ${date} | ${text}`);
  }

  // Encounters last: they are the first to go if the context is too large.
  const encIds: string[] = [];
  for (const e of encounters.data ?? []) {
    const text = [e.type, e.summary].filter(Boolean).join(" | ");
    encIds.push(add("E", { kind: "encounter", label: `Encounter ${e.encounter_date}`, text, date: e.encounter_date, href: timeline, focus: `enc-${e.id}` }, (id) => `${id} | encounter | ${e.encounter_date} | ${text}`));
  }

  let size = [...lines.values()].reduce((a, l) => a + l.length + 1, 0);
  for (const id of encIds) { // oldest first
    if (size <= MAX_CHARS) break;
    size -= lines.get(id)!.length + 1;
    lines.delete(id);
    sources.delete(id);
  }

  return { text: [...lines.values()].join("\n"), sources };
}
