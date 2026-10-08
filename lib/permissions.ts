export type Role = "doctor" | "nurse";

// The one place that says who may do what. The README table is generated from this.
export const PERMISSIONS = {
  view_patients: { label: "View patients", roles: ["doctor", "nurse"] },
  upload: { label: "Upload reports", roles: ["doctor", "nurse"] },
  edit_draft: { label: "Edit drafts", roles: ["doctor", "nurse"] },
  approve: { label: "Approve documents and notes", roles: ["doctor"] },
  discard: { label: "Discard drafts", roles: ["doctor"] },
  record_consultation: { label: "Record consultations", roles: ["doctor", "nurse"] },
  ask: { label: "Ask Medora", roles: ["doctor", "nurse"] },
  view_audit: { label: "View the audit log", roles: ["doctor"] },
  "task.confirm": { label: "Confirm follow-up tasks", roles: ["doctor"] },
  "task.dismiss": { label: "Dismiss follow-up tasks", roles: ["doctor"] },
  "task.complete": { label: "Mark tasks done", roles: ["doctor", "nurse"] },
} as const satisfies Record<string, { label: string; roles: readonly Role[] }>;

export type Action = keyof typeof PERMISSIONS;

export function can(role: string | null | undefined, action: Action): boolean {
  return (PERMISSIONS[action].roles as readonly string[]).includes(role ?? "");
}
