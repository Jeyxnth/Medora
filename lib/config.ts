// Which providers answer AI requests, in order. Default is OpenRouter then DeepSeek; a provider is skipped when its key is not set.
// Add "gemini" or "groq" to use them too, e.g. LLM_PROVIDERS=openrouter,deepseek,gemini
const list = (v: string | undefined) => (v ?? "").split(",").map((m) => m.trim()).filter(Boolean);

const num = (v: string | undefined, fallback: number) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : fallback);

// Failover timing. A route that fails with 429/502/503/504/timeout/network is retried after LLM_RETRY_DELAY_MS (up to
// LLM_RETRY_ATTEMPTS times), then rests for LLM_ROUTE_COOLDOWN_MS while the next route is used.
export const LLM_RETRY_DELAY_MS = num(process.env.LLM_RETRY_DELAY_MS, 3000);
export const LLM_RETRY_ATTEMPTS = num(process.env.LLM_RETRY_ATTEMPTS, 1);
export const LLM_ROUTE_COOLDOWN_MS = num(process.env.LLM_ROUTE_COOLDOWN_MS, 10_000);
// Time limits. One provider call is cut off after LLM_CALL_TIMEOUT_MS; one request (all routes and retry waits together)
// stops trying routes after LLM_TOTAL_BUDGET_MS, so the friendly error arrives before the route's 60 s maxDuration.
export const LLM_CALL_TIMEOUT_MS = num(process.env.LLM_CALL_TIMEOUT_MS, 15_000);
export const LLM_TOTAL_BUDGET_MS = num(process.env.LLM_TOTAL_BUDGET_MS, 50_000);

export const LLM_PROVIDERS = list(process.env.LLM_PROVIDERS || "openrouter,deepseek");
// Image calls only: API providers first, then the local Ollama model if every API route failed.
export const LLM_VISION_PROVIDERS = list(process.env.LLM_VISION_PROVIDERS || "openrouter,ollama");

// Ollama (local, localhost only: Vercel cannot reach it). Skipped when no model is set.
// It has its own time limit, separate from LLM_TOTAL_BUDGET_MS, which starts when Ollama is reached.
export const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1").replace(/\/+$/, "");
export const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || "";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || ""; // text, only used if "ollama" is in LLM_PROVIDERS
export const OLLAMA_CALL_TIMEOUT_MS = num(process.env.OLLAMA_CALL_TIMEOUT_MS, 120_000);

// OpenRouter: free models by default (see https://openrouter.ai/models). Free models are rate limited and sometimes busy.
export const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-super-120b-a12b:free"; // text
export const OPENROUTER_VISION_MODEL = process.env.OPENROUTER_VISION_MODEL || "google/gemma-4-31b-it:free"; // images (document reading)
export const OPENROUTER_FALLBACK_MODELS = list(process.env.OPENROUTER_FALLBACK_MODELS || "apodex/apodex-1.1-mini:free"); // text calls, tried in order
export const OPENROUTER_VISION_FALLBACK_MODELS = list(process.env.OPENROUTER_VISION_FALLBACK_MODELS || "google/gemma-4-26b-a4b-it:free,dots-studio/dots-3-note-preview:free"); // image calls, vision-capable models only

// DeepSeek: text only, never used for images.
export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

// Gemini (only used when "gemini" is in LLM_PROVIDERS). Valid names for your keys: `npm run check:gemini-models`.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
export const GEMINI_VISION_MODEL = process.env.GEMINI_VISION_MODEL || GEMINI_MODEL; // images (document extraction)
// Tried after the primary model when it returns 404 (comma-separated).
export const GEMINI_FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS || "gemini-3.7-flash").split(",").map((m) => m.trim()).filter(Boolean);

// Groq models are set in env so a deprecated model is a config change. List valid ids with `npm run check:models`.
// Transcription always uses Groq; the Groq chat model is only used when "groq" is in LLM_PROVIDERS.
export const GROQ_WHISPER_MODEL = process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo";
export const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-120b";
