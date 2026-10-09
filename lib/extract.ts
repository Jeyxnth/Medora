import { generateJSON } from "./llm";

export type Confidence = "high" | "medium" | "low";

export type LabResult = {
  test_name: string;
  value: number | null;
  value_text: string;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  printed_flag: string | null;
  confidence: Confidence;
};

export const ILLEGIBLE = "illegible";
export const isIllegible = (v: string | null | undefined) => (v ?? "").trim().toLowerCase() === ILLEGIBLE;

export type MedField = "drug_name" | "dose" | "frequency" | "duration";
export type Medication = {
  drug_name: string; // may be "illegible"
  dose: string | null; // may be "illegible"
  frequency: string | null; // may be "illegible"
  duration: string | null; // may be "illegible"
  confidence: Confidence; // overall for the row
  field_conf?: Record<MedField, Confidence>; // per field; missing on older extractions
  src_idx?: number; // position in the AI's reading, so edits can be traced after rows are added or removed
};

// What the AI read, kept so the doctor's changes can be audited.
export type AiOriginal = { document_date: string | null; prescriber: string | null; medications: Medication[] };

export type Extraction = {
  doc_type: "lab_report" | "prescription" | "other";
  document_date: string | null;
  patient_name: string | null;
  prescriber: string | null; // may be "illegible"
  lab_name: string | null;
  date_confidence?: Confidence;
  prescriber_confidence?: Confidence;
  ai_original?: AiOriginal;
  review?: unknown; // set on approval: who confirmed and what changed from the AI reading
  lab_results: LabResult[];
  medications: Medication[];
  notes: string | null;
};

const str = { type: "string" };
const nstr = { type: ["string", "null"] };
const nnum = { type: ["number", "null"] };
const conf = { type: "string", enum: ["high", "medium", "low"] };

export const SCHEMA = {
  type: "object",
  properties: {
    doc_type: { type: "string", enum: ["lab_report", "prescription", "other"] },
    document_date: nstr,
    patient_name: nstr,
    prescriber: nstr,
    lab_name: nstr,
    lab_results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          test_name: str, value: nnum, value_text: str, unit: nstr,
          ref_low: nnum, ref_high: nnum, printed_flag: nstr, confidence: conf,
        },
        required: ["test_name", "value", "value_text", "unit", "ref_low", "ref_high", "printed_flag", "confidence"],
      },
    },
    medications: {
      type: "array",
      items: {
        type: "object",
        properties: {
          drug_name: str, dose: nstr, frequency: nstr, duration: nstr, confidence: conf,
          field_conf: {
            type: "object",
            properties: { drug_name: conf, dose: conf, frequency: conf, duration: conf },
            required: ["drug_name", "dose", "frequency", "duration"],
          },
        },
        required: ["drug_name", "dose", "frequency", "duration", "confidence", "field_conf"],
      },
    },
    notes: nstr,
    date_confidence: conf,
    prescriber_confidence: conf,
  },
  required: ["doc_type", "document_date", "patient_name", "prescriber", "lab_name", "lab_results", "medications", "notes", "date_confidence", "prescriber_confidence"],
};

export const SYSTEM = `You transcribe medical documents (lab reports, prescriptions) into structured JSON.
Rules:
- Transcribe exactly what is printed. Never guess or infer missing values; use null instead.
- Never compute flags or reference ranges yourself. printed_flag is only a flag printed on the document (e.g. "H", "L", "High"), else null.
- value_text is the result exactly as printed. value is its number, or null if not numeric.
- Reference ranges: "> 90" means ref_low 90 and ref_high null; "< 30" means ref_high 30 and ref_low null; "4.0 - 5.6" means ref_low 4.0 and ref_high 5.6.
- Dates on Indian documents are day-first (DD/MM/YYYY); always output ISO yyyy-mm-dd. If a date is ambiguous or missing, return null.
- Use "low" confidence for anything blurry, cut off or ambiguous.
- Ignore headers, footers and signatures, except for the document date, patient name, lab name and prescriber.
- Handwriting: read it as carefully as print. For each medication give a confidence (high, medium, low) for each of drug_name, dose, frequency and duration in field_conf. Same for the document date (date_confidence) and the prescriber (prescriber_confidence).
- If a word or number cannot be read at all, write exactly "illegible" in that field (drug_name, dose, frequency, duration, prescriber, or document_date) with low confidence. Never fill a gap with a plausible guess. If you can read part of it, give your best reading with low confidence.
- A drug name you are unsure of: write what the letters look like, not the closest real drug, and mark it low.
- For a lab report fill lab_results and leave medications empty; for a prescription fill medications and leave lab_results empty.`;

// One vision call per upload.
export async function extractDocument(image: Buffer, mimeType: string): Promise<Extraction> {
  const x = await generateJSON<Extraction>({
    system: SYSTEM,
    prompt: "Extract this document.",
    images: [{ mimeType, data: image.toString("base64") }],
    schema: SCHEMA,
  });
  // An unreadable date has no valid value: leave it empty and low confidence so the doctor must enter it.
  if (isIllegible(x.document_date) || (x.document_date && !/^\d{4}-\d{2}-\d{2}$/.test(x.document_date))) {
    x.document_date = null;
    x.date_confidence = "low";
  }
  x.medications = (x.medications ?? []).map((m, i) => ({ ...m, src_idx: i }));
  x.ai_original = { document_date: x.document_date, prescriber: x.prescriber, medications: x.medications };
  return x;
}
