import { MED_FIELDS, medFlags } from "./validate";
import type { AiOriginal, Extraction, Medication } from "./extract";

export type ReviewSummary = {
  changes: { item: string; field: string; from: string | null; to: string | null }[];
  confirmed_as_read: string[]; // flagged fields the doctor kept as the AI read them
  added: string[];
  removed: string[];
};

const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim() === (b ?? "").trim();

// What the doctor changed from the AI's reading of a prescription, for the audit log.
export function diffReading(orig: AiOriginal | undefined, final: Extraction): ReviewSummary {
  const out: ReviewSummary = { changes: [], confirmed_as_read: [], added: [], removed: [] };
  if (!orig) return out;

  const top = (item: string, field: string, from: string | null, to: string | null) => {
    if (!same(from, to)) out.changes.push({ item, field, from, to });
  };
  top("document", "document_date", orig.document_date, final.document_date);
  top("document", "prescriber", orig.prescriber, final.prescriber);

  const bySrc = new Map<number, Medication>();
  for (const m of final.medications) if (m.src_idx != null) bySrc.set(m.src_idx, m);
  for (const o of orig.medications) {
    const now = bySrc.get(o.src_idx ?? -1);
    if (!now) { out.removed.push(o.drug_name); continue; }
    for (const f of MED_FIELDS) {
      if (!same(o[f], now[f])) out.changes.push({ item: o.drug_name, field: f, from: o[f], to: now[f] });
    }
    for (const f of medFlags(o)) if (same(o[f], now[f])) out.confirmed_as_read.push(`${o.drug_name}: ${f}`);
  }
  for (const m of final.medications) if (m.src_idx == null) out.added.push(m.drug_name);
  return out;
}
