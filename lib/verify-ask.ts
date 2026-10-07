type Src = { date: string | null; text: string };

// Numbers as normalised tokens, so "03" and "3", "1.50" and "1.5" count as the same.
function numbers(s: string): string[] {
  return (s.replace(/(\d),(?=\d{3}\b)/g, "$1").match(/\d+(?:\.\d+)?/g) ?? []).map((t) => String(Number(t)));
}

const ID = String.raw`\b[A-Z]{1,2}\d{1,3}\b`;
const GROUP = new RegExp(String.raw`\s*[(\[]\s*${ID}(?:\s*(?:,|;|&|and)\s*${ID})*\s*[)\]]`, "g");

// Removes source-id citations (e.g. "(L2, L15)", "[E1]", bare "A1") that are keys in the sources map.
export function stripSourceIds(text: string, sources: Map<string, unknown>): string {
  const known = (t: string) => (t.match(new RegExp(ID, "g")) ?? []).every((id) => sources.has(id));
  return text
    .replace(GROUP, (m) => (known(m) ? "" : m))
    .replace(new RegExp(String.raw`\s*${ID}`, "g"), (m) => (sources.has(m.trim()) ? "" : m))
    .replace(/\s+([,.;])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Returns the cleaned text plus a verdict; numbers and whole ISO dates must appear in a cited source.
export function verifyStatement(rawText: string, validIds: string[], sources: Map<string, Src>) {
  const text = stripSourceIds(rawText, sources);
  const hay = validIds.map((id) => `${sources.get(id)!.date ?? ""} ${sources.get(id)!.text}`).join(" | ");
  const dates = text.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  const cited = new Set(numbers(hay));
  const ok =
    dates.every((d) => hay.includes(d)) &&
    numbers(text.replace(/\d{4}-\d{2}-\d{2}/g, " ")).every((x) => cited.has(x));
  return ok ? { text, verified: true } : { text, verified: false, reason: "number not found in cited source" };
}
