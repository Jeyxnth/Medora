const list = (v: string | undefined) => (v ?? "").split(",").map((m) => m.trim()).filter(Boolean);
const num = (v: string | undefined, fallback: number) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : fallback);

// Which providers answer AI requests, in order: Gemini (every key x every model), then Groq chat as the last route for TEXT calls.
export const LLM_PROVIDERS = list(process.env.LLM_PROVIDERS || "gemini,groq");
// Image calls only. The only valid value is gemini: Groq is never used for images.
export const LLM_VISION_PROVIDERS = list(process.env.LLM_VISION_PROVIDERS || "gemini").filter((p) => p === "gemini");

// Failover timing. A route that fails with 429/502/503/504/timeout/network is retried after LLM_RETRY_DELAY_MS (up to
// LLM_RETRY_ATTEMPTS times), then rests for LLM_ROUTE_COOLDOWN_MS while the next route is used.
export const LLM_RETRY_DELAY_MS = num(process.env.LLM_RETRY_DELAY_MS, 3000);
export const LLM_RETRY_ATTEMPTS = num(process.env.LLM_RETRY_ATTEMPTS, 1);
export const LLM_ROUTE_COOLDOWN_MS = num(process.env.LLM_ROUTE_COOLDOWN_MS, 10_000);
// Time limits. One provider call is cut off after LLM_CALL_TIMEOUT_MS (image calls on Gemini can take more than 15 s); one
// request (all routes and retry waits together) stops trying routes after LLM_TOTAL_BUDGET_MS, so the friendly error
// arrives before the route's 60 s maxDuration.
export const LLM_CALL_TIMEOUT_MS = num(process.env.LLM_CALL_TIMEOUT_MS, 25_000);
export const LLM_TOTAL_BUDGET_MS = num(process.env.LLM_TOTAL_BUDGET_MS, 50_000);

// Gemini. Valid names for your keys: `npm run check:gemini-models`.
// gemini-2.5-flash is listed but returns 404 "no longer available to new users". These exact names were probed on both keys.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
export const GEMINI_VISION_MODEL = process.env.GEMINI_VISION_MODEL || GEMINI_MODEL; // images (document extraction)
// Tried after the primary model, in order (comma-separated).
export const GEMINI_FALLBACK_MODELS = list(process.env.GEMINI_FALLBACK_MODELS || "gemini-3.7-flash");

// Groq models are set in env so a deprecated model is a config change. List valid ids with `npm run check:models`.
// Transcription always uses Groq; the Groq chat model is the last route for text calls when "groq" is in LLM_PROVIDERS.
export const GROQ_WHISPER_MODEL = process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo";
export const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-120b";
