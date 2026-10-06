export type TimelineType = "encounter" | "lab" | "medication" | "document" | "note";

export type LabRow = {
  test_name: string;
  value: number;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  flag: string | null;
};

export type TimelineItem = {
  id: string;
  type: TimelineType;
  date: string; // YYYY-MM-DD
  title: string;
  detail?: string;
  draft?: boolean;
  labs?: LabRow[];
};

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function isOutOfRange(l: LabRow): boolean {
  if (l.flag && l.flag.toLowerCase() !== "normal") return true;
  return (l.ref_low != null && l.value < l.ref_low) || (l.ref_high != null && l.value > l.ref_high);
}

export function buildTimeline(src: {
  encounters: Row[];
  labs: Row[];
  medications: Row[];
  documents: Row[];
  notes: Row[];
}): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const e of src.encounters) {
    if (!e.encounter_date) continue;
    items.push({ id: `enc-${e.id}`, type: "encounter", date: e.encounter_date, title: e.type || "Encounter", detail: e.summary });
  }

  const byDate = new Map<string, LabRow[]>();
  for (const l of src.labs) {
    if (!l.collected_date) continue;
    byDate.set(l.collected_date, [...(byDate.get(l.collected_date) ?? []), l as LabRow]);
  }
  for (const [date, labs] of byDate) {
    const abnormal = labs.filter(isOutOfRange).length;
    items.push({
      id: `lab-${date}`, type: "lab", date, title: `Lab results (${labs.length} tests)`,
      detail: abnormal ? `${abnormal} out of range` : "All in range", labs,
    });
  }

  for (const m of src.medications) {
    const what = [m.drug_name, m.dose, m.frequency].filter(Boolean).join(" ");
    if (m.start_date) items.push({ id: `medstart-${m.id}`, type: "medication", date: m.start_date, title: `Started ${what}`, detail: m.prescribed_by ? `Prescribed by ${m.prescribed_by}` : undefined });
    if (m.end_date) items.push({ id: `medstop-${m.id}`, type: "medication", date: m.end_date, title: `Stopped ${m.drug_name}` });
  }

  for (const d of src.documents) {
    items.push({ id: `doc-${d.id}`, type: "document", date: String(d.uploaded_at).slice(0, 10), title: d.doc_type || "Document", draft: d.status === "draft" });
  }

  for (const n of src.notes) {
    items.push({ id: `note-${n.id}`, type: "note", date: String(n.created_at).slice(0, 10), title: n.note_type ? `${n.note_type} note` : "Clinical note", draft: n.status === "draft" });
  }

  return items.sort((a, b) => b.date.localeCompare(a.date));
}
