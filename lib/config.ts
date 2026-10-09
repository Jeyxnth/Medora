// Gemini models are env-driven. Valid names for your keys: `npm run check:gemini-models`.
// gemini-2.5-flash is listed but returns 404 "no longer available to new users". These exact names were probed on both keys.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
export const GEMINI_VISION_MODEL = process.env.GEMINI_VISION_MODEL || GEMINI_MODEL; // images (document extraction)
// Tried after the primary model when it returns 404 (comma-separated).
export const GEMINI_FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS || "gemini-3.7-flash").split(",").map((m) => m.trim()).filter(Boolean);
// Groq models are set in env so a deprecated model is a config change. List valid ids with `npm run check:models`.
export const GROQ_WHISPER_MODEL = process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo";
export const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-120b";
