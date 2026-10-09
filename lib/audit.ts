import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/roles";

export async function logAudit(a: {
  action: string;
  entityType: string;
  entityId?: string;
  patientId?: string;
}) {
  const supabase = await createClient();
  const user = await currentUser(supabase);
  await supabase.from("audit_log").insert({
    user_id: user?.id,
    action: a.action,
    entity_type: a.entityType,
    entity_id: a.entityId,
    patient_id: a.patientId,
  });
}
