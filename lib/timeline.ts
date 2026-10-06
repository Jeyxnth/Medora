export type TimelineType = "encounter" | "lab" | "medication" | "document" | "note";

export type LabRow = {
  test_name: string;
  value: number;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  flag: string | null;
  document_id?: string | null;
  prev?: number | null; // value of the same test at the previous earlier date
};

export type TimelineItem = {
  id: string;
  type: TimelineType;
  date: string; // YYYY-MM-DD
  title: string;
  detail?: string;
  draft?: boolean;
  labs?: LabRow[];
  href?: string; // review page of the source document or note
};

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function isOutOfRange(l: LabRow): boolean {
  if (l.flag && l.flag.toLowerCase() !== "normal") return true;
  return (l.ref_low != null && l.value < l.ref_low) || (l.ref_high != null && l.value > l.ref_high);
}

export function formatRange(l: Pick<LabRow, "ref_low" | "ref_high">): string {
  if (l.ref_low != null && l.ref_high != null) return `${l.ref_low} - ${l.ref_high}`;
  if (l.ref_low != null) return `> ${l.ref_low}`;
  if (l.ref_high != null) return `< ${l.ref_high}`;
  return "-";
}

export function buildTimeline(src: {
  patientId: string;
  encounters: Row[];
  labs: Row[];
  medications: Row[];
  documents: Row[];
  notes: Row[];
}): TimelineItem[] {
  const items: TimelineItem[] = [];
  const docHref = (id: string) => `/patients/${src.patientId}/documents/${id}`;

  for (const e of src.encounters) {
    if (!e.encounter_date) continue;
    items.push({ id: `enc-${e.id}`, type: "encounter", date: e.encounter_date, title: e.type || "Encounter", detail: e.summary });
  }

  const byDate = new Map<string, LabRow[]>();
  for (const l of src.labs) {
    if (!l.collected_date) continue;
    byDate.set(l.collected_date, [...(byDate.get(l.collected_date) ?? []), l as LabRow]);
  }
  const dates = [...byDate.keys()].sort();
  for (const [date, labs] of byDate) {
    const earlier = dates.filter((d) => d < date).reverse(); // nearest first
    for (const l of labs) {
      const hit = earlier.map((d) => byDate.get(d)!.find((x) => x.test_name === l.test_name)).find(Boolean);
      l.prev = hit ? hit.value : null;
    }
    const abnormal = labs.filter(isOutOfRange).length;
    const docId = labs.find((l) => l.document_id)?.document_id;
    items.push({
      id: `lab-${date}`, type: "lab", date, title: `Lab results (${labs.length} tests)`,
      detail: abnormal ? `${abnormal} out of range` : "All in range", labs,
      href: docId ? docHref(docId) : undefined,
    });
  }

  for (const m of src.medications) {
    const what = [m.drug_name, m.dose, m.frequency].filter(Boolean).join(" ");
    if (m.start_date) items.push({ id: `medstart-${m.id}`, type: "medication", date: m.start_date, title: `Started ${what}`, detail: m.prescribed_by ? `Prescribed by ${m.prescribed_by}` : undefined });
    if (m.end_date) items.push({ id: `medstop-${m.id}`, type: "medication", date: m.end_date, title: `Stopped ${m.drug_name}` });
  }

  for (const d of src.documents) {
    items.push({ id: `doc-${d.id}`, type: "document", date: String(d.uploaded_at).slice(0, 10), title: d.doc_type === "lab_report" ? "Lab report" : d.doc_type === "prescription" ? "Prescription" : d.doc_type === "pending" ? "Document (not read yet)" : "Document", draft: d.status === "draft", href: docHref(d.id) });
  }

  for (const n of src.notes) {
    items.push({ id: `note-${n.id}`, type: "note", date: String(n.created_at).slice(0, 10), title: n.note_type ? `${n.note_type} note` : "Clinical note", draft: n.status === "draft", href: `/patients/${src.patientId}/notes/${n.id}` });
  }

  return items.sort((a, b) => b.date.localeCompare(a.date));
}
