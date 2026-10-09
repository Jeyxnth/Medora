import { GoogleGenAI } from "@google/genai";

// Friendly error that is safe to show in the UI (never contains provider JSON or keys).
export class AiError extends Error {}
export class QuotaError extends AiError {
  constructor() { super("AI quota exhausted, try again later"); }
}

const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000;
const exhaustedUntil = new Map<string, number>(); // key -> time it may be used again (in memory only)

function keys(): string[] {
  const all = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2, ...(process.env.GEMINI_API_KEYS ?? "").split(",")];
  return [...new Set(all.map((k) => k?.trim()).filter((k): k is string => !!k))];
}

const msg = (e: unknown) => String((e as Error)?.message ?? e);
const status = (e: unknown) => (e as { status?: number })?.status ?? Number(/"code":\s*(\d{3})/.exec(msg(e))?.[1] ?? 0);

function isQuota(e: unknown) {
  return status(e) === 429 || /RESOURCE_EXHAUSTED|quota/i.test(msg(e)) || /\b429\b/.test(msg(e));
}

// "retryDelay":"37s" (or "retry in 37.5s") -> ms; default 1 hour.
function retryDelayMs(e: unknown) {
  const m = /retryDelay"?:\s*"?(\d+(?:\.\d+)?)s/i.exec(msg(e)) ?? /retry in (\d+(?:\.\d+)?)s/i.exec(msg(e));
  return m ? Math.ceil(Number(m[1]) * 1000) : DEFAULT_COOLDOWN_MS;
}

// Every Gemini call goes through here. Tries each key that is not cooling down:
// quota error -> mark the key exhausted and try the next; 5xx / network error -> try the next key once.
export async function withGemini<T>(fn: (ai: GoogleGenAI) => Promise<T>): Promise<T> {
  const all = keys();
  if (!all.length) throw new AiError("AI is not configured");
  const now = Date.now();
  const usable = all.filter((k) => (exhaustedUntil.get(k) ?? 0) <= now);
  let quota = false;
  let other = false;

  for (const key of usable) {
    try {
      return await fn(new GoogleGenAI({ apiKey: key }));
    } catch (e) {
      const n = all.indexOf(key) + 1;
      if (isQuota(e)) {
        quota = true;
        exhaustedUntil.set(key, Date.now() + retryDelayMs(e));
        console.warn(`[gemini] key #${n} quota exhausted, trying next`);
      } else if (status(e) >= 500 || !status(e)) {
        other = true;
        console.warn(`[gemini] key #${n} failed (${status(e) || "network"}), trying next`);
      } else {
        console.error(`[gemini] request rejected (${status(e)})`);
        throw new AiError("The AI request failed");
      }
    }
  }
  if (quota || !usable.length) throw new QuotaError();
  throw new AiError(other ? "The AI service is temporarily unavailable, try again later" : "The AI request failed");
}
