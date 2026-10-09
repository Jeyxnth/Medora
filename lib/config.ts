// TODO: change to whichever Flash model AI Studio currently lists.
export const GEMINI_MODEL = "gemini-2.5-flash";
// Groq models are set in env so a deprecated model is a config change. List valid ids with `npm run check:models`.
export const GROQ_WHISPER_MODEL = process.env.GROQ_WHISPER_MODEL || "whisper-large-v3-turbo";
export const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-120b";
