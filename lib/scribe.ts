import { generateJSON } from "./llm";

export type Speaker = "doctor" | "patient" | "other";
export type Segment = { id: number; start: number | null; end: number | null; text: string; speaker: Speaker };
export type Statement = { text: string; sources: number[] };
export type SoapKey = "subjective" | "objective" | "assessment" | "plan";
export type Soap = Record<SoapKey, Statement[]>;
export type MedChange = {
  drug_name: string;
  action: "start" | "stop" | "change";
  new_dose: string | null;
  new_frequency: string | null;
  reason: string | null;
  sources: number[];
  applied?: boolean; // set at approval: the doctor ticked it and it was applied
};
export type NoteContent = { segments: Segment[]; soap: Soap; med_changes: MedChange[]; not_discussed: string[] };

export const SOAP_KEYS: { key: SoapKey; label: string }[] = [
  { key: "subjective", label: "Subjective" },
  { key: "objective", label: "Objective" },
  { key: "assessment", label: "Assessment" },
  { key: "plan", label: "Plan" },
];

// Pasted text -> numbered segments, one per line, long lines split into sentences.
export function splitTranscript(text: string): { id: number; start: null; end: null; text: string }[] {
  const parts = text
    .split(/\r?\n/)
    .flatMap((line) => line.match(/[^.?!]+[.?!]*/g) ?? [])
    .map((t) => t.trim())
    .filter(Boolean);
  return parts.map((t, i) => ({ id: i + 1, start: null, end: null, text: t }));
}

const str = { type: "string" };
const nstr = { type: ["string", "null"] };
const statements = {
  type: "array",
  items: {
    type: "object",
    properties: { text: str, sources: { type: "array", items: { type: "integer" } } },
    required: ["text", "sources"],
  },
};

const SCHEMA = {
  type: "object",
  properties: {
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "integer" }, speaker: { type: "string", enum: ["doctor", "patient", "other"] } },
        required: ["id", "speaker"],
      },
    },
    soap: {
      type: "object",
      properties: { subjective: statements, objective: statements, assessment: statements, plan: statements },
      required: ["subjective", "objective", "assessment", "plan"],
    },
    med_changes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          drug_name: str,
          action: { type: "string", enum: ["start", "stop", "change"] },
          new_dose: nstr, new_frequency: nstr, reason: nstr,
          sources: { type: "array", items: { type: "integer" } },
        },
        required: ["drug_name", "action", "new_dose", "new_frequency", "reason", "sources"],
      },
    },
    not_discussed: { type: "array", items: str },
  },
  required: ["segments", "soap", "med_changes", "not_discussed"],
};

const SYSTEM = `You are a medical scribe. You turn a numbered consultation transcript into a draft SOAP note for the clinician to review.
Rules:
- Write ONLY what was said in the conversation. Never invent findings, vitals, diagnoses, plans or history.
- If a SOAP section has nothing from the conversation, return an empty array for it.
- Every statement must cite at least one source segment id in "sources". Use only ids that exist in the transcript.
- Assessment contains only what the clinician stated or clearly concluded aloud.
- Subjective is the patient's reported symptoms and history. Objective is only findings, vitals or results the clinician stated aloud.
- med_changes only when the clinician explicitly said to start, stop or change a medicine. Use null for dose, frequency or reason that was not said.
- The patient's current medication list is given ONLY so you can resolve references such as "the painkiller" or "the sugar tablet" to a drug named in the conversation. Never add a statement or med_change because of that list.
- Use short clinical phrasing, one fact per statement.
- Return a speaker for every segment, inferred from content: the doctor asks questions and gives instructions, the patient reports symptoms. Use "other" for anyone else or if unclear.
- not_discussed lists routine items that a clinician would normally cover but were not mentioned (for example allergies, vitals), as short phrases.`;

export async function draftNote(args: {
  segments: { id: number; start: number | null; end: number | null; text: string }[];
  patient: { name: string; age: number | null; sex: string | null };
  activeMeds: string[];
}): Promise<NoteContent> {
  const { segments, patient, activeMeds } = args;
  const prompt = `Patient: ${patient.name}, ${patient.age ?? "unknown age"}, ${patient.sex ?? "unknown sex"}
Current medications (for resolving references only): ${activeMeds.join(", ") || "none"}

Transcript:
${segments.map((s) => `[${s.id}] ${s.text}`).join("\n")}`;

  const out = await generateJSON<Omit<NoteContent, "segments"> & { segments: { id: number; speaker: Speaker }[] }>({
    system: SYSTEM, prompt, schema: SCHEMA,
  });

  const ids = new Set(segments.map((s) => s.id));
  const speakers = new Map((out.segments ?? []).map((s) => [s.id, s.speaker]));
  const clean = (list: Statement[] | undefined) =>
    (list ?? [])
      .map((x) => ({ text: String(x.text ?? "").trim(), sources: (x.sources ?? []).filter((n) => ids.has(n)) }))
      .filter((x) => x.text);

  return {
    segments: segments.map((s) => ({ ...s, speaker: speakers.get(s.id) ?? "other" })),
    soap: {
      subjective: clean(out.soap?.subjective), objective: clean(out.soap?.objective),
      assessment: clean(out.soap?.assessment), plan: clean(out.soap?.plan),
    },
    med_changes: (out.med_changes ?? []).map((m) => ({ ...m, sources: (m.sources ?? []).filter((n) => ids.has(n)) })),
    not_discussed: out.not_discussed ?? [],
  };
}

export const transcriptText = (segments: Segment[]) =>
  segments.map((s) => `${s.speaker === "doctor" ? "Doctor" : s.speaker === "patient" ? "Patient" : "Other"}: ${s.text}`).join("\n");
