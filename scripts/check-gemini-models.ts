// Lists the Gemini models each configured key can see, and which support generateContent.
// Prints key numbers only, never the keys. Pick names for GEMINI_MODEL / GEMINI_VISION_MODEL.
import { config } from "dotenv";

config({ path: ".env.local" });

type Model = { name: string; supportedGenerationMethods?: string[] };

async function main() {
  const all = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2, ...(process.env.GEMINI_API_KEYS ?? "").split(",")];
  const keys = [...new Set(all.map((k) => k?.trim()).filter((k): k is string => !!k))];
  if (!keys.length) return console.error("No GEMINI_API_KEY set in .env.local");

  const wanted = [process.env.GEMINI_MODEL || "gemini-3.8-flash", process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || "gemini-3.8-flash"];
  const lists: Set<string>[] = [];
  for (const [i, key] of keys.entries()) {
    console.log(`\nKey #${i + 1}`);
    const models: Model[] = [];
    let token = "";
    do {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200${token ? `&pageToken=${token}` : ""}`, {
        headers: { "x-goog-api-key": key },
      });
      if (!res.ok) { console.log(`  list failed: HTTP ${res.status}`); break; }
      const body = (await res.json()) as { models?: Model[]; nextPageToken?: string };
      models.push(...(body.models ?? []));
      token = body.nextPageToken ?? "";
    } while (token);

    const usable = new Set<string>();
    for (const m of models.sort((a, b) => a.name.localeCompare(b.name))) {
      const ok = m.supportedGenerationMethods?.includes("generateContent");
      if (ok) usable.add(m.name.replace("models/", ""));
      if (ok || /gemini/.test(m.name)) console.log(`  ${ok ? "generateContent" : "other          "}  ${m.name.replace("models/", "")}`);
    }
    lists.push(usable);
    for (const w of new Set(wanted)) console.log(`  -> configured "${w}": ${usable.has(w) ? "OK" : "NOT AVAILABLE on this key"}`);
  }
}
main();
