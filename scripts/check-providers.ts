// Shows which AI providers, keys and models are configured. Names and counts only: no key is printed and NO AI call is made.
// Usage: npm run check:providers
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const cfg = await import("../lib/config");
  const { geminiKeys } = await import("../lib/gemini-client");

  const keys = geminiKeys();
  const models = [...new Set([cfg.GEMINI_MODEL, cfg.GEMINI_VISION_MODEL, ...cfg.GEMINI_FALLBACK_MODELS])];
  const groq = !!process.env.GROQ_API_KEY;

  console.log(`LLM_PROVIDERS (text)         = ${cfg.LLM_PROVIDERS.join(",") || "(none)"}`);
  console.log(`LLM_VISION_PROVIDERS (image) = ${cfg.LLM_VISION_PROVIDERS.join(",") || "(none)"}`);
  console.log(`\nGemini: ${keys.length} key(s) configured (${keys.map((_, i) => `#${i + 1}`).join(", ") || "none"})`);
  console.log(`  text model:    ${cfg.GEMINI_MODEL}`);
  console.log(`  image model:   ${cfg.GEMINI_VISION_MODEL}`);
  console.log(`  fallbacks:     ${cfg.GEMINI_FALLBACK_MODELS.join(", ") || "none"}`);
  console.log(`  routes per call: ${keys.length} key(s) x ${models.length} model(s) = ${keys.length * models.length}`);
  console.log(`\nGroq key: ${groq ? "set" : "NOT set"}`);
  console.log(`  chat (text calls only, last route): ${cfg.LLM_PROVIDERS.includes("groq") ? (groq ? cfg.GROQ_CHAT_MODEL : "listed, but no key") : "not in LLM_PROVIDERS"}`);
  console.log(`  transcription: ${groq ? cfg.GROQ_WHISPER_MODEL : "no key, so recording cannot be transcribed"}`);
  console.log("  images never go to Groq");
  console.log(`\nTiming: retry ${cfg.LLM_RETRY_ATTEMPTS}x after ${cfg.LLM_RETRY_DELAY_MS} ms, route rest ${cfg.LLM_ROUTE_COOLDOWN_MS} ms, call timeout ${cfg.LLM_CALL_TIMEOUT_MS} ms, total budget ${cfg.LLM_TOTAL_BUDGET_MS} ms`);
  if (!keys.length) console.log("\nWARNING: no Gemini key is set (GEMINI_API_KEY, GEMINI_API_KEY_2 or GEMINI_API_KEYS).");
  for (const old of ["OPENROUTER_API_KEY", "DEEPSEEK_API_KEY", "OLLAMA_VISION_MODEL", "OLLAMA_BASE_URL"]) {
    if (process.env[old]) console.log(`NOTE: ${old} is still in .env.local; it is no longer used and can be deleted.`);
  }
}
main();
