// Fixed locale + timezone so server and browser render identical text (no hydration mismatch).
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function toDate(input: string | Date): Date {
  if (input instanceof Date) return input;
  return new Date(DATE_ONLY.test(input) ? `${input}T00:00:00Z` : input);
}

const DATE_OPTS = {
  short: { day: "numeric", month: "short", year: "numeric" },
  long: { day: "numeric", month: "long", year: "numeric" },
  month: { month: "short", year: "2-digit" },
} as const;

export function formatDate(input: string | Date, opts: keyof typeof DATE_OPTS = "short"): string {
  return toDate(input).toLocaleDateString("en-IN", { ...DATE_OPTS[opts], timeZone: "UTC" });
}

export function formatDateTime(input: string | Date): string {
  return toDate(input).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata",
  });
}
