import { createClient } from "@/lib/supabase/server";
import { currentUser } from "@/lib/roles";

export async function logAudit(a: {
  action: string;
  entityType: string;
  entityId?: string;
  patientId?: string;
  details?: unknown; // free-form JSON (needs audit_log.details, see supabase/phase9.sql)
}) {
  const supabase = await createClient();
  const user = await currentUser(supabase);
  const row: Record<string, unknown> = {
    user_id: user?.id,
    action: a.action,
    entity_type: a.entityType,
    entity_id: a.entityId,
    patient_id: a.patientId,
  };
  const { error } = await supabase.from("audit_log").insert(a.details === undefined ? row : { ...row, details: a.details });
  // If phase9.sql has not been run yet, still record the event without the details.
  if (error && a.details !== undefined) await supabase.from("audit_log").insert(row);
}
