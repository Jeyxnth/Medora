import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { currentRole, currentUser } from "@/lib/roles";
import { AiError } from "@/lib/gemini-client";
import { generateJSON } from "@/lib/llm";
import { buildPatientContext, type Source } from "@/lib/records";
import { stripSourceIds, verifyStatement } from "@/lib/verify-ask";
import { loadSafetyContext } from "@/lib/safety-context";
import { checkSafety, type Alert } from "@/lib/safety";
import { careGaps, type CareGap } from "@/lib/care-gaps";
import { groupSeries, trendInsights, type Insight, type TrendLab } from "@/lib/trends";
import type { AskStatement } from "@/app/api/ask/route";

export const maxDuration = 60;

type Raw = { last_visit: { text: string; sources: string[] }[]; discuss: { text: string; sources: string[] }[] };
export type BriefTask = { id: string; title: string; due_date: string | null; overdue: boolean };
export type BriefResult = {
  lastVisit: AskStatement[];
  discuss: AskStatement[];
  trends: Insight[];
  alerts: Alert[];
  careGaps: CareGap[];
  tasks: BriefTask[];
  sources: Record<string, Pick<Source, "id" | "label" | "href">>;
};

const list = {
  type: "array",
  items: {
    type: "object",
    properties: { text: { type: "string" }, sources: { type: "array", items: { type: "string" } } },
    required: ["text", "sources"],
  },
};
const SCHEMA = {
  type: "object",
  properties: { last_visit: list, discuss: list },
  required: ["last_visit", "discuss"],
};

const SYSTEM = `You prepare a pre-visit brief about ONE patient for a clinician, using only the records provided.
Rules:
- Use ONLY the provided records. Never use outside medical knowledge to fill gaps.
- Every statement must cite at least one source id (like L12, N2, M4) from the list, in the sources array only. Do not write ids in the text.
- Copy numbers and dates exactly as written in the records. Do not compute new numbers.
- last_visit: 1 to 2 short statements about the most recent encounter or note (what happened, what was decided). Empty array if there is none.
- discuss: at most 3 short things worth raising at the next visit, grounded in the records (for example a pending plan item, an abnormal or worsening result, a medicine change to follow up). No treatment recommendations and no diagnoses that are not already in the records.`;

export async function POST(req: Request) {
  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!can(await currentRole(supabase), "view_patients")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const patientId = String(body?.patientId ?? "");
  if (!patientId) return NextResponse.json({ error: "patientId required" }, { status: 400 });

  const { text, sources } = await buildPatientContext(patientId);
  if (!sources.size) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  let raw: Raw;
  try {
    raw = await generateJSON<Raw>({ system: SYSTEM, prompt: `RECORDS (id | kind | details):\n${text}\n\nWrite the pre-visit brief.`, schema: SCHEMA });
  } catch (e) {
    return NextResponse.json({ error: e instanceof AiError ? e.message : "AI request failed" }, { status: 502 });
  }

  const used: BriefResult["sources"] = {};
  const check = (list: Raw["last_visit"], max: number): AskStatement[] =>
    (list ?? []).slice(0, max).map((s) => {
      const valid = [...new Set((s.sources ?? []).filter((id) => sources.has(id)))];
      for (const id of valid) used[id] = { id, label: sources.get(id)!.label, href: sources.get(id)!.href };
      if (!valid.length) return { text: stripSourceIds(s.text, sources), sources: [], verified: false, reason: "no valid source cited" };
      return { sources: valid, ...verifyStatement(s.text, valid, sources) };
    });

  // Trends, alerts and tasks come straight from code, not from the AI.
  const [safety, labs, tasks, encounters, allMeds, allTasks] = await Promise.all([
    loadSafetyContext(supabase, patientId),
    supabase.from("lab_results").select("*").eq("patient_id", patientId),
    supabase.from("tasks").select("id, title, due_date").eq("patient_id", patientId).eq("status", "open").order("due_date", { nullsFirst: false }),
    supabase.from("encounters").select("id, encounter_date, summary").eq("patient_id", patientId),
    supabase.from("medications").select("id, drug_name, end_date").eq("patient_id", patientId),
    supabase.from("tasks").select("status").eq("patient_id", patientId),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  const result: BriefResult = {
    lastVisit: check(raw.last_visit, 2),
    discuss: check(raw.discuss, 3),
    trends: trendInsights(groupSeries((labs.data ?? []) as TrendLab[])),
    alerts: checkSafety({ patientId, ...safety }),
    careGaps: careGaps({
      today, encounters: encounters.data ?? [], medications: allMeds.data ?? [],
      labs: (labs.data ?? []) as TrendLab[], tasks: allTasks.data ?? [],
    }),
    tasks: (tasks.data ?? []).map((t) => ({ ...t, overdue: !!t.due_date && t.due_date < today })),
    sources: used,
  };

  await logAudit({ action: "brief.generate", entityType: "patient", entityId: patientId, patientId });
  return NextResponse.json(result);
}
