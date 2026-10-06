export function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) age--;
  return age;
}

const normName = (s: string) =>
  s.toLowerCase().replace(/\b(ms|mr|mrs|miss|dr|smt|shri)\b\.?/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

export function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && normName(a) === normName(b);
}
