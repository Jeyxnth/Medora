"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { can, type Action } from "@/lib/permissions";

type Step = { permission: Action; from: string; to: string; audit: string; stamp: "confirmed" | "completed" | null };
const STEPS = {
  confirm: { permission: "task.confirm", from: "draft", to: "open", audit: "task.confirm", stamp: "confirmed" },
  dismiss: { permission: "task.dismiss", from: "draft", to: "dismissed", audit: "task.dismiss", stamp: null },
  complete: { permission: "task.complete", from: "open", to: "done", audit: "task.complete", stamp: "completed" },
} satisfies Record<string, Step>;

async function move(taskId: string, step: Step): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!can(profile?.role, step.permission)) return { error: "You are not allowed to do that." };

  const now = new Date().toISOString();
  const stamp = step.stamp ? { [`${step.stamp}_by`]: user.id, [`${step.stamp}_at`]: now } : {};
  const { data, error } = await supabase.from("tasks").update({ status: step.to, ...stamp })
    .eq("id", taskId).eq("status", step.from).select("patient_id").maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "This task has already changed." };

  await logAudit({ action: step.audit, entityType: "task", entityId: taskId, patientId: data.patient_id });
  revalidatePath(`/patients/${data.patient_id}`);
  return {};
}

export async function confirmTask(taskId: string) {
  return move(taskId, STEPS.confirm);
}
export async function dismissTask(taskId: string) {
  return move(taskId, STEPS.dismiss);
}
export async function completeTask(taskId: string) {
  return move(taskId, STEPS.complete);
}
