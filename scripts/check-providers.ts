// ONE tiny text call per configured provider (OpenRouter, DeepSeek). Prints OK/FAILED. Never runs vision. Never calls Gemini.
// Usage: npm run check:providers
import { config } from "dotenv";

config({ path: ".env.local" });

const schema = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] };

async function main() {
  const { chatJSON } = await import("../lib/openai-compat");
  const cfg = await import("../lib/config");
  const { OPENROUTER_URL, DEEPSEEK_URL } = await import("../lib/llm");

  const targets = [
    { name: "openrouter", url: OPENROUTER_URL, key: process.env.OPENROUTER_API_KEY, model: cfg.OPENROUTER_MODEL },
    { name: "deepseek", url: DEEPSEEK_URL, key: process.env.DEEPSEEK_API_KEY, model: cfg.DEEPSEEK_MODEL },
  ];
  console.log(`LLM_PROVIDERS = ${cfg.LLM_PROVIDERS.join(",")}`);
  for (const t of targets) {
    if (!cfg.LLM_PROVIDERS.includes(t.name)) { console.log(`${t.name}: not in LLM_PROVIDERS, skipped`); continue; }
    if (!t.key) { console.log(`${t.name}: no API key set, skipped`); continue; }
    if (!t.model) { console.log(`${t.name}: no model set (OPENROUTER_MODEL), skipped`); continue; }
    try {
      await chatJSON({ url: t.url, key: t.key, model: t.model, system: "You reply with JSON.", prompt: 'Return {"ok": true}.', schema });
      console.log(`${t.name} (${t.model}): OK`);
    } catch (e) {
      console.log(`${t.name} (${t.model}): FAILED (${(e as { status?: unknown }).status ?? "error"})`);
    }
  }
  // Ollama: only asks the local server which models it has (GET /api/tags). No model call.
  console.log(`LLM_VISION_PROVIDERS = ${cfg.LLM_VISION_PROVIDERS.join(",")}`);
  try {
    const res = await fetch(`${new URL(cfg.OLLAMA_BASE_URL).origin}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const tags = (await res.json()) as { models?: { name: string }[] };
    const names = (tags.models ?? []).map((m) => m.name);
    const want = cfg.OLLAMA_VISION_MODEL;
    console.log(`ollama: OK (${names.length} model(s))${want ? `; vision model ${want} ${names.includes(want) ? "is installed" : "is NOT installed"}` : "; OLLAMA_VISION_MODEL not set, so it is skipped"}`);
  } catch {
    console.log("ollama: not running");
  }
  if (cfg.LLM_PROVIDERS.some((p) => !["openrouter", "deepseek", "ollama"].includes(p))) console.log("(other providers in LLM_PROVIDERS are not tested by this script)");
}
main();
