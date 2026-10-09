"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { currentUser } from "@/lib/roles";
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
  await logAudit({ action: "approve", entityType: "document", entityId: docId, patientId: doc.patient_id });
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
