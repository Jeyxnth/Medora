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

export type Medication = {
  drug_name: string;
  dose: string | null;
  frequency: string | null;
  duration: string | null;
  confidence: Confidence;
};

export type Extraction = {
  doc_type: "lab_report" | "prescription" | "other";
  document_date: string | null;
  patient_name: string | null;
  prescriber: string | null;
  lab_name: string | null;
  lab_results: LabResult[];
  medications: Medication[];
  notes: string | null;
};

const str = { type: "string" };
const nstr = { type: ["string", "null"] };
const nnum = { type: ["number", "null"] };
const conf = { type: "string", enum: ["high", "medium", "low"] };

const SCHEMA = {
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
        properties: { drug_name: str, dose: nstr, frequency: nstr, duration: nstr, confidence: conf },
        required: ["drug_name", "dose", "frequency", "duration", "confidence"],
      },
    },
    notes: nstr,
  },
  required: ["doc_type", "document_date", "patient_name", "prescriber", "lab_name", "lab_results", "medications", "notes"],
};

const SYSTEM = `You transcribe medical documents (lab reports, prescriptions) into structured JSON.
Rules:
- Transcribe exactly what is printed. Never guess or infer missing values; use null instead.
- Never compute flags or reference ranges yourself. printed_flag is only a flag printed on the document (e.g. "H", "L", "High"), else null.
- value_text is the result exactly as printed. value is its number, or null if not numeric.
- Reference ranges: "> 90" means ref_low 90 and ref_high null; "< 30" means ref_high 30 and ref_low null; "4.0 - 5.6" means ref_low 4.0 and ref_high 5.6.
- document_date must be ISO yyyy-mm-dd, or null if not printed or ambiguous.
- Use "low" confidence for anything blurry, cut off or ambiguous.
- Ignore headers, footers and signatures, except for the document date, patient name, lab name and prescriber.
- For a lab report fill lab_results and leave medications empty; for a prescription fill medications and leave lab_results empty.`;

export function extractDocument(image: Buffer, mimeType: string): Promise<Extraction> {
  return generateJSON<Extraction>({
    system: SYSTEM,
    prompt: "Extract this document.",
    images: [{ mimeType, data: image.toString("base64") }],
    schema: SCHEMA,
  });
}
