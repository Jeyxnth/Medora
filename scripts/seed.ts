import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { patients } from "./seed-data";

config({ path: ".env.local" });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ok = (r: { data: any; error: { message: string } | null }, what: string) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

async function ensureUser(email: string, full_name: string, role: string) {
  const list = ok(await db.auth.admin.listUsers({ perPage: 1000 }), "listUsers");
  let user = list.users.find((u: { email?: string }) => u.email === email);
  if (!user) {
    user = ok(
      await db.auth.admin.createUser({ email, password: "demo1234", email_confirm: true }),
      `createUser ${email}`
    ).user;
  }
  ok(await db.from("profiles").upsert({ id: user.id, full_name, role }), "profiles");
}

async function main() {
  // clear data tables (children first); keep auth users and profiles
  for (const t of ["audit_log", "clinical_notes", "lab_results", "documents", "medications", "encounters", "allergies", "patients"]) {
    ok(await db.from(t).delete().neq("id", "00000000-0000-0000-0000-000000000000"), `clear ${t}`);
  }

  await ensureUser("doctor@demo.com", "Dr. Anita Rao", "doctor");
  await ensureUser("nurse@demo.com", "Nurse Priya Das", "nurse");

  for (const { p, allergies, encounters, meds, labs } of patients) {
    const [row] = ok(await db.from("patients").insert(p).select(), "patients");
    const withId = <T extends object>(rows: T[]) => rows.map((r) => ({ ...r, patient_id: row.id }));
    if (allergies.length) ok(await db.from("allergies").insert(withId(allergies)), "allergies");
    ok(await db.from("encounters").insert(withId(encounters)), "encounters");
    ok(await db.from("medications").insert(withId(meds.map((m) => ({ ...m, prescribed_by: "Dr. Anita Rao" })))), "medications");
    ok(await db.from("lab_results").insert(withId(labs)), "lab_results");
  }
  console.log("Seeded 5 patients; users doctor@demo.com / nurse@demo.com (password demo1234)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
