"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { currentProfile, currentUser } from "@/lib/roles";
import { isIllegible } from "@/lib/extract";
import { diffReading } from "@/lib/review-diff";
import { loadSafetyContext } from "@/lib/safety-context";
import { checkSafety } from "@/lib/safety";
import { can } from "@/lib/permissions";
import { canonicalName, computeFlag } from "@/lib/validate";
import type { Extraction } from "@/lib/extract";

const FLAG_WORD = { H: "high", L: "low", N: "normal" } as const; // same words the seed uses

async function load(docId: string) {
  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) throw new Error("Not signed in");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const { data: doc } = await supabase.from("documents").select("*").eq("id", docId).single();
  if (!doc) throw new Error("Document not found");
  return { supabase, role: profile?.role as string | undefined, doc };
}

export async function saveDraft(docId: string, data: Extraction): Promise<{ error?: string }> {
  const { supabase, role, doc } = await load(docId);
  if (!can(role, "edit_draft")) return { error: "You cannot edit drafts." };
  if (doc.status !== "draft") return { error: "Document is already approved" };
  const { error } = await supabase.from("documents").update({ extracted_json: data }).eq("id", docId);
  if (error) return { error: error.message };
  await logAudit({ action: "edit", entityType: "document", entityId: docId, patientId: doc.patient_id });
  return {};
}

export async function approveDocument(docId: string, data: Extraction): Promise<{ error?: string }> {
  const { supabase, role, doc } = await load(docId);
  if (!can(role, "approve")) return { error: "Only a doctor can approve." };
  if (doc.status !== "draft") return { error: "Document is already approved" };
  if (!data.document_date) return { error: "Document date is required." };

  // Handwritten prescriptions: nothing illegible may be saved, and the audit entry records what changed from the AI's reading.
  let details: Record<string, unknown> | undefined;
  if (doc.doc_type === "prescription") {
    const unreadable = data.medications.some((m) => [m.drug_name, m.dose, m.frequency, m.duration].some(isIllegible)) || isIllegible(data.prescriber);
    if (unreadable) return { error: "Some fields are still marked illegible. Enter the correct value or remove the row." };

    const original = (doc.extracted_json as Extraction | null)?.ai_original ?? data.ai_original;
    data.ai_original = original;
    const ctx = await loadSafetyContext(supabase, doc.patient_id);
    const alerts = checkSafety({
      patientId: doc.patient_id, allergies: ctx.allergies, labs: ctx.labs,
      activeMeds: [...ctx.activeMeds, ...data.medications.map((m) => ({ drug_name: m.drug_name, dose: m.dose, frequency: m.frequency }))],
    }).filter((a) => a.medIndexes.some((i) => i >= ctx.activeMeds.length));
    const profile = await currentProfile(supabase);
    details = {
      confirmed_by: profile?.full_name ?? null,
      ...diffReading(original, data),
      safety_alerts: alerts.map((a) => `${a.severity}: ${a.title}`),
    };
    data.review = { ...details, confirmed_at: new Date().toISOString() };
  }

  if (doc.doc_type === "lab_report") {
    const rows = data.lab_results
      .filter((r) => typeof r.value === "number")
      .map((r) => {
        const flag = computeFlag(r.value, r.ref_low, r.ref_high);
        return {
          patient_id: doc.patient_id,
          document_id: docId,
          test_name: canonicalName(r.test_name) ?? r.test_name,
          value: r.value,
          unit: r.unit,
          ref_low: r.ref_low,
          ref_high: r.ref_high,
          flag: flag ? FLAG_WORD[flag] : null,
          collected_date: data.document_date,
        };
      });
    if (rows.length) {
      const { error } = await supabase.from("lab_results").insert(rows);
      if (error) return { error: error.message };
    }
  } else if (doc.doc_type === "prescription") {
    const rows = data.medications.map((m) => ({
      patient_id: doc.patient_id,
      drug_name: m.drug_name,
      dose: m.dose,
      frequency: m.frequency,
      start_date: data.document_date,
      prescribed_by: data.prescriber,
    }));
    if (rows.length) {
      const { error } = await supabase.from("medications").insert(rows);
      if (error) return { error: error.message };
    }
  }

  const { error } = await supabase.from("documents").update({ status: "approved", extracted_json: data }).eq("id", docId);
  if (error) return { error: error.message };
  await logAudit({ action: "approve", entityType: "document", entityId: docId, patientId: doc.patient_id, details });
  redirect(`/patients/${doc.patient_id}`);
}

export async function discardDocument(docId: string): Promise<{ error?: string }> {
  const { supabase, role, doc } = await load(docId);
  if (!can(role, "discard")) return { error: "Only a doctor can discard." };
  if (doc.status !== "draft") return { error: "Approved documents cannot be discarded" };
  if (doc.file_path) await supabase.storage.from("documents").remove([doc.file_path]);
  const { error } = await supabase.from("documents").delete().eq("id", docId);
  if (error) return { error: error.message };
  await logAudit({ action: "discard", entityType: "document", entityId: docId, patientId: doc.patient_id });
  redirect(`/patients/${doc.patient_id}`);
}
