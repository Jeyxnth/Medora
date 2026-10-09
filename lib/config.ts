// Which providers answer AI requests, in order. Default is OpenRouter then DeepSeek; a provider is skipped when its key is not set.
// Add "gemini" or "groq" to use them too, e.g. LLM_PROVIDERS=openrouter,deepseek,gemini
const list = (v: string | undefined) => (v ?? "").split(",").map((m) => m.trim()).filter(Boolean);

export const LLM_PROVIDERS = list(process.env.LLM_PROVIDERS || "openrouter,deepseek");

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
