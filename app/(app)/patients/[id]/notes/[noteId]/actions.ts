"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { normalizeDrug } from "@/lib/safety";
import type { NoteContent } from "@/lib/scribe";

async function load(noteId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  const { data: note } = await supabase.from("clinical_notes").select("*").eq("id", noteId).single();
  if (!note) throw new Error("Note not found");
  return { supabase, user, profile, note };
}

export async function saveNoteDraft(noteId: string, content: NoteContent): Promise<{ error?: string }> {
  const { supabase, profile, note } = await load(noteId);
  if (!can(profile?.role, "edit_draft")) return { error: "You cannot edit drafts." };
  if (note.status !== "draft") return { error: "Note is already approved" };
  const { error } = await supabase.from("clinical_notes").update({ content }).eq("id", noteId);
  if (error) return { error: error.message };
  await logAudit({ action: "edit", entityType: "clinical_note", entityId: noteId, patientId: note.patient_id });
  return {};
}

export async function approveNote(noteId: string, content: NoteContent, tickedIdx: number[]): Promise<{ error?: string }> {
  const { supabase, user, profile, note } = await load(noteId);
  if (!can(profile?.role, "approve")) return { error: "Only a doctor can approve." };
  if (note.status !== "draft") return { error: "Note is already approved" };

  const patientId = note.patient_id as string;
  const today = new Date().toISOString().slice(0, 10);
  const summary = content.soap.assessment[0]?.text ?? content.soap.subjective[0]?.text ?? null;

  const { data: enc, error: encErr } = await supabase
    .from("encounters")
    .insert({ patient_id: patientId, encounter_date: today, type: "Consultation", summary })
    .select("id")
    .single();
  if (encErr) return { error: encErr.message };

  const { data: meds } = await supabase.from("medications").select("*").eq("patient_id", patientId);
  const active = (meds ?? []).filter((m) => !m.end_date || m.end_date > today);
  const skipped: string[] = [];
  const touched: string[] = [];
  const newRow = (name: string, dose: string | null, frequency: string | null) =>
    supabase.from("medications")
      .insert({ patient_id: patientId, drug_name: name, dose, frequency, start_date: today, prescribed_by: profile?.full_name })
      .select("id").single();

  const med_changes = content.med_changes.map((c) => ({ ...c, applied: false }));
  for (const i of tickedIdx) {
    const c = med_changes[i];
    if (!c) continue;
    const match = active.find((m) => normalizeDrug(m.drug_name) === normalizeDrug(c.drug_name));
    if (c.action !== "start" && !match) { skipped.push(c.drug_name); continue; }

    if (match) {
      const { error } = await supabase.from("medications").update({ end_date: today }).eq("id", match.id);
      if (error) return { error: error.message };
      touched.push(match.id);
      active.splice(active.indexOf(match), 1);
    }
    if (c.action !== "stop") {
      const { data, error } = await newRow(
        match?.drug_name ?? c.drug_name,
        c.new_dose ?? match?.dose ?? null,
        c.new_frequency ?? match?.frequency ?? null,
      );
      if (error) return { error: error.message };
      touched.push(data.id);
    }
    c.applied = true;
  }

  const { error } = await supabase
    .from("clinical_notes")
    .update({ status: "approved", approved_by: user.id, encounter_id: enc.id, content: { ...content, med_changes } })
    .eq("id", noteId);
  if (error) return { error: error.message };

  await logAudit({ action: "approve", entityType: "clinical_note", entityId: noteId, patientId });
  for (const id of touched) await logAudit({ action: "update", entityType: "medication", entityId: id, patientId });

  const notice = skipped.length
    ? `Note approved. Not applied (no matching active medication): ${skipped.join(", ")}`
    : "Note approved and saved";
  redirect(`/patients/${patientId}?notice=${encodeURIComponent(notice)}`);
}

export async function discardNote(noteId: string): Promise<{ error?: string }> {
  const { supabase, profile, note } = await load(noteId);
  if (!can(profile?.role, "discard")) return { error: "Only a doctor can discard." };
  if (note.status !== "draft") return { error: "Approved notes cannot be discarded" };
  const { error } = await supabase.from("clinical_notes").delete().eq("id", noteId);
  if (error) return { error: error.message };
  await logAudit({ action: "discard", entityType: "clinical_note", entityId: noteId, patientId: note.patient_id });
  redirect(`/patients/${note.patient_id}`);
}
