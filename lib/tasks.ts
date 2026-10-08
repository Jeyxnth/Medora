import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJSON } from "./llm";
import { logAudit } from "./audit";
import type { Statement } from "./scribe";

export type TaskKind = "test" | "medication" | "follow_up" | "advice";
export type Task = {
  id: string; patient_id: string; note_id: string | null; title: string; kind: TaskKind;
  due_date: string | null; status: "draft" | "open" | "done" | "dismissed"; source_refs: number[]; created_at: string;
};

const SCHEMA = {
  type: "object",
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          statement: { type: "integer" },
          title: { type: "string" },
          kind: { type: "string", enum: ["test", "medication", "follow_up", "advice"] },
          due_in_days: { type: ["integer", "null"] },
        },
        required: ["statement", "title", "kind", "due_in_days"],
      },
    },
  },
  required: ["tasks"],
};

const SYSTEM = `You turn the approved Plan of a consultation note into a short follow-up task list.
Rules:
- Use ONLY what the Plan says. Do not invent tasks, tests, medicines or dates.
- Exactly one task per actionable Plan statement (a test to order, a medicine to stop/start/avoid, a follow-up or review, a piece of advice). Never split one statement into several tasks. Skip statements that are not actionable.
- "statement" is the 0-based index of the Plan statement the task comes from.
- title: short, imperative, under 12 words.
- kind: test, medication, follow_up or advice.
- due_in_days: a number of days only if the Plan gives timing (for example "review in 2 weeks" = 14); otherwise null.`;

// Drafts tasks from the approved Plan. Never throws: approval must succeed even if this fails.
export async function draftTasksFromPlan(
  supabase: SupabaseClient, a: { noteId: string; patientId: string; plan: Statement[] },
): Promise<void> {
  try {
    if (!a.plan.length) return;
    const { count } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("note_id", a.noteId);
    if (count) return; // already drafted for this note

    const out = await generateJSON<{ tasks: { statement: number; title: string; kind: TaskKind; due_in_days: number | null }[] }>({
      system: SYSTEM,
      prompt: `PLAN:\n${a.plan.map((s, i) => `[${i}] ${s.text}`).join("\n")}`,
      schema: SCHEMA,
    });

    const base = new Date();
    const rows = (out.tasks ?? [])
      .filter((t) => t.title?.trim() && a.plan[t.statement])
      .map((t) => {
        const due = typeof t.due_in_days === "number" && t.due_in_days >= 0
          ? new Date(base.getTime() + t.due_in_days * 86400000).toISOString().slice(0, 10) : null;
        return {
          patient_id: a.patientId, note_id: a.noteId, title: t.title.trim(), kind: t.kind, due_date: due,
          status: "draft", source_refs: a.plan[t.statement].sources ?? [],
        };
      });
    if (!rows.length) return;

    const { data, error } = await supabase.from("tasks").upsert(rows, { onConflict: "note_id,title", ignoreDuplicates: true }).select("id");
    if (error) throw new Error(error.message);
    for (const t of data ?? []) await logAudit({ action: "task.draft_created", entityType: "task", entityId: t.id, patientId: a.patientId });
  } catch (e) {
    console.error("task drafting failed for note", a.noteId, e);
  }
}
