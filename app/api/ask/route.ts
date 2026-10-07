import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { currentRole } from "@/lib/roles";
import { generateJSON } from "@/lib/llm";
import { buildPatientContext, type Source } from "@/lib/records";
import { stripSourceIds, verifyStatement } from "@/lib/verify-ask";

export const maxDuration = 60;

type Raw = { answer: { text: string; sources: string[] }[]; not_found: boolean; follow_ups: string[] };
export type AskStatement = { text: string; sources: string[]; verified: boolean; reason?: string };
export type AskResult = {
  answer: AskStatement[];
  not_found: boolean;
  follow_ups: string[];
  sources: Record<string, Pick<Source, "id" | "label" | "href">>;
};

const SCHEMA = {
  type: "object",
  properties: {
    answer: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" }, sources: { type: "array", items: { type: "string" } } },
        required: ["text", "sources"],
      },
    },
    not_found: { type: "boolean" },
    follow_ups: { type: "array", items: { type: "string" } },
  },
  required: ["answer", "not_found", "follow_ups"],
};

const SYSTEM = `You answer questions about ONE patient for a clinician, using only the records provided.
Rules:
- Answer ONLY from the provided records. Never use outside medical knowledge to fill gaps in the records.
- Every statement must cite at least one source id (like L12, N2, M4) taken from the list. Cite the lines the statement is based on.
- If the records do not contain the answer, set not_found to true and say in one statement what is missing. Never guess.
- Do not write source ids in the statement text; put them only in the sources array.
- Keep each statement short and include the values and dates exactly as written in the records. Copy numbers exactly; do not compute new numbers or counts.
- No treatment recommendations and no diagnoses that are not already in the records.
- follow_ups: up to 3 short, useful follow-up questions the records could answer. Empty if not_found.`;

const SUMMARY_PROMPT = `Summarize this patient in 6 to 10 short statements covering, in order: who the patient is, active problems evident from the records, current medications, allergies, key lab trends with the first and latest values (with dates), and recent encounters. Only mention what the records show.`;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  if (!can(await currentRole(supabase), "ask")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const patientId = String(body?.patientId ?? "");
  const summary = body?.mode === "summary";
  const question = String(body?.question ?? "").trim().slice(0, 500);
  if (!patientId) return NextResponse.json({ error: "patientId required" }, { status: 400 });
  if (!summary && !question) return NextResponse.json({ error: "Ask a question" }, { status: 400 });

  const { text, sources } = await buildPatientContext(patientId);
  if (!sources.size) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  let raw: Raw;
  try {
    raw = await generateJSON<Raw>({
      system: SYSTEM,
      prompt: `RECORDS (id | kind | details):\n${text}\n\n${summary ? SUMMARY_PROMPT : `QUESTION: ${question}`}`,
      schema: SCHEMA,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI request failed" }, { status: 502 });
  }

  const used: AskResult["sources"] = {};
  const answer: AskStatement[] = (raw.answer ?? []).map((s) => {
    const valid = [...new Set((s.sources ?? []).filter((id) => sources.has(id)))];
    for (const id of valid) used[id] = { id, label: sources.get(id)!.label, href: sources.get(id)!.href };
    if (!valid.length) return { text: stripSourceIds(s.text, sources), sources: [], verified: false, reason: "no valid source cited" };
    return { sources: valid, ...verifyStatement(s.text, valid, sources) };
  });

  await logAudit({ action: "ask", entityType: "patient", entityId: patientId, patientId });
  const result: AskResult = { answer, not_found: !!raw.not_found, follow_ups: (raw.follow_ups ?? []).slice(0, 3), sources: used };
  return NextResponse.json(result);
}
