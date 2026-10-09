import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { currentRole } from "@/lib/roles";
import { can } from "@/lib/permissions";
import type { NoteContent } from "@/lib/scribe";
import { loadSafetyContext } from "@/lib/safety-context";
import NoteReview from "@/components/NoteReview";

export default async function NotePage(props: PageProps<"/patients/[id]/notes/[noteId]">) {
  const { id, noteId } = await props.params;
  const { notice } = await props.searchParams;
  const supabase = await createClient();

  const [{ data: note }, { data: patient }, role, safety] = await Promise.all([
    supabase.from("clinical_notes").select("*").eq("id", noteId).eq("patient_id", id).single(),
    supabase.from("patients").select("name").eq("id", id).single(),
    currentRole(supabase),
    loadSafetyContext(supabase, id),
  ]);
  if (!note?.content) notFound();
  await logAudit({ action: "view", entityType: "clinical_note", entityId: noteId, patientId: id });

  return (
    <div className="space-y-3">
      <Link href={`/patients/${id}`} className="text-sm text-brand-700 hover:underline">← Back to {patient?.name ?? "patient"}</Link>
      {typeof notice === "string" && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{notice}</p>
      )}
      <NoteReview
        noteId={noteId}
        approved={note.status === "approved"}
        isDoctor={can(role, "approve")}
        canDiscard={can(role, "discard")}
        initial={note.content as NoteContent}
        patientId={id}
        safety={safety}
      />
    </div>
  );
}
