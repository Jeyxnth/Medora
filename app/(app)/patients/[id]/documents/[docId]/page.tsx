import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { namesMatch } from "@/lib/utils";
import type { Extraction } from "@/lib/extract";
import { loadSafetyContext } from "@/lib/safety-context";
import ReviewForm from "@/components/ReviewForm";

export default async function DocumentPage(props: PageProps<"/patients/[id]/documents/[docId]">) {
  const { id, docId } = await props.params;
  const supabase = await createClient();

  const { data: doc } = await supabase.from("documents").select("*").eq("id", docId).eq("patient_id", id).single();
  if (!doc) notFound();
  const { data: patient } = await supabase.from("patients").select("name").eq("id", id).single();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user?.id ?? "").single();
  const { data: signed } = await supabase.storage.from("documents").createSignedUrl(doc.file_path, 3600);

  const safety = await loadSafetyContext(supabase, id);
  await logAudit({ action: "view", entityType: "document", entityId: docId, patientId: id });

  const extraction = (doc.extracted_json ?? null) as Extraction | null;
  const nameMismatch = !!extraction && !namesMatch(extraction.patient_name, patient?.name);

  return (
    <div className="space-y-4">
      <Link href={`/patients/${id}`} className="text-sm text-teal-700 hover:underline">← Back to {patient?.name ?? "patient"}</Link>
      {!extraction ? (
        <div className="card p-6 text-sm text-slate-600">
          This document has not been read yet (extraction may have failed). Discard it and upload again.
        </div>
      ) : (
        <ReviewForm
          docId={docId}
          docType={doc.doc_type}
          approved={doc.status === "approved"}
          isDoctor={can(profile?.role, "approve")}
          canDiscard={can(profile?.role, "discard")}
          imageUrl={signed?.signedUrl ?? null}
          initial={extraction}
          patientName={patient?.name ?? ""}
          nameMismatch={nameMismatch}
          patientId={id}
          safety={safety}
        />
      )}
    </div>
  );
}
