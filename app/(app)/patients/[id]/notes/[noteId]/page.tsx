import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import type { NoteContent } from "@/lib/scribe";
import { loadSafetyContext } from "@/lib/safety-context";
import NoteReview from "@/components/NoteReview";

export default async function NotePage(props: PageProps<"/patients/[id]/notes/[noteId]">) {
  const { id, noteId } = await props.params;
  const supabase = await createClient();

  const { data: note } = await supabase.from("clinical_notes").select("*").eq("id", noteId).eq("patient_id", id).single();
  if (!note?.content) notFound();
  const { data: patient } = await supabase.from("patients").select("name").eq("id", id).single();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user?.id ?? "").single();

  const safety = await loadSafetyContext(supabase, id);
  await logAudit({ action: "view", entityType: "clinical_note", entityId: noteId, patientId: id });

  return (
    <div className="space-y-3">
      <Link href={`/patients/${id}`} className="text-sm text-teal-700 hover:underline">← Back to {patient?.name ?? "patient"}</Link>
      <NoteReview
        noteId={noteId}
        approved={note.status === "approved"}
        isDoctor={can(profile?.role, "approve")}
        canDiscard={can(profile?.role, "discard")}
        initial={note.content as NoteContent}
        patientId={id}
        safety={safety}
      />
    </div>
  );
}
