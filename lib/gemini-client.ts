import { GoogleGenAI } from "@google/genai";

// Friendly errors that are safe to show in the UI (never contain provider JSON or keys).
export class AiError extends Error {}
export class QuotaError extends AiError {
  constructor() { super("AI quota exhausted, try again later"); }
}

// A failed route. `status` is the HTTP code, or "timeout" / "network" / "unreadable".
// `retryAfterMs` is how long the provider asked us to wait (used for 429).
export class RouteError extends Error {
  constructor(public status: number | "timeout" | "network" | "unreadable", public retryAfterMs?: number) { super(`route failed (${status})`); }
}

const DEFAULT_QUOTA_REST_MS = 60 * 60 * 1000; // a quota error without a retryDelay parks the key for an hour
const exhaustedUntil = new Map<string, number>(); // key -> time it may be used again (in memory only)
const missing = new Set<string>(); // "keyNumber:model" routes that returned 404 (model not found): skipped from then on

// GEMINI_API_KEY, GEMINI_API_KEY_2 and the comma-separated GEMINI_API_KEYS, without duplicates.
export function geminiKeys(): string[] {
  const all = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2, ...(process.env.GEMINI_API_KEYS ?? "").split(",")];
  return [...new Set(all.map((k) => k?.trim()).filter((k): k is string => !!k))];
}

const msg = (e: unknown) => String((e as Error)?.message ?? e);
const status = (e: unknown) => (e as { status?: number })?.status ?? Number(/"code":\s*(\d{3})/.exec(msg(e))?.[1] ?? 0);

function isQuota(e: unknown) {
  return status(e) === 429 || /RESOURCE_EXHAUSTED|quota/i.test(msg(e)) || /\b429\b/.test(msg(e));
}

// "retryDelay":"37s" (or "retry in 37.5s") -> ms
function retryDelayMs(e: unknown) {
  const m = /retryDelay"?:\s*"?(\d+(?:\.\d+)?)s/i.exec(msg(e)) ?? /retry in (\d+(?:\.\d+)?)s/i.exec(msg(e));
  return m ? Math.ceil(Number(m[1]) * 1000) : DEFAULT_QUOTA_REST_MS;
}

// Id of one Gemini route (one key x one model). Only the key's number is used, never the key.
export const geminiRouteId = (n: number, model: string) => `gemini#${n}:${model}`;

// False for a model that returned 404 on this key, or a key whose quota is used up.
export function geminiRouteUsable(n: number, key: string, model: string): boolean {
  return !missing.has(geminiRouteId(n, model)) && (exhaustedUntil.get(key) ?? 0) <= Date.now();
}

// One call on one route. Failures become RouteErrors so the failover layer (runRoutes in lib/llm.ts) can decide what to do:
//   404            -> the route is skipped from now on
//   429 / quota    -> the key is parked for the provider's retryDelay (default 1 hour); retryAfterMs carries it
//   anything else  -> its HTTP status, or "network" when there is none
// Logs only the key number and model, never the key.
export async function geminiCall<T>(n: number, key: string, model: string, fn: (ai: GoogleGenAI, model: string) => Promise<T>): Promise<T> {
  try {
    return await fn(new GoogleGenAI({ apiKey: key }), model);
  } catch (e) {
    if (status(e) === 404) {
      missing.add(geminiRouteId(n, model));
      console.warn(`[gemini] key #${n} model=${model} not found (404), skipping this route from now on`);
      throw new RouteError(404);
    }
    if (isQuota(e)) {
      const wait = retryDelayMs(e);
      exhaustedUntil.set(key, Date.now() + wait);
      console.warn(`[gemini] key #${n} quota exhausted, resting ${Math.round(wait / 1000)}s`);
      throw new RouteError(429, wait);
    }
    throw new RouteError(status(e) || "network");
  }
}
