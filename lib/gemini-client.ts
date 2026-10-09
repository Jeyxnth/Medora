import { GoogleGenAI } from "@google/genai";
import { LLM_ROUTE_COOLDOWN_MS } from "./config";

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

const missing = new Set<string>(); // routes ("keyNumber:model") that returned 404
const busyUntil = new Map<string, number>(); // routes that returned 500/502/503/504 or a network error
const RETRY_PAUSE_MS = 1500;
let lastGood: string | null = null; // the route that last succeeded, tried first

type Route = { id: string; key: string; n: number; model: string };

// Every Gemini call goes through here. A route is one key x one model, tried in order (primary model on every key
// first, then the fallback models), with the last route that worked in front:
//   404 (model not found)      -> route is skipped from now on
//   429 / quota                -> the key is parked for the retryDelay (default 1 hour)
//   500/502/503/504 / network  -> the route rests for LLM_ROUTE_COOLDOWN_MS
// If every route is busy, wait 1.5 s and go through the list once more, then give up with a friendly error.
export async function withGemini<T>(fn: (ai: GoogleGenAI, model: string) => Promise<T>, models: string[]): Promise<T> {
  const all = keys();
  if (!all.length) throw new AiError("AI is not configured");
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const outcome = { quota: false, busy: false, missing: false };

  const attempt = async (routes: Route[]): Promise<{ done: true; value: T } | { done: false }> => {
    for (const r of routes) {
      try {
        const value = await fn(new GoogleGenAI({ apiKey: r.key }), r.model);
        lastGood = r.id;
        return { done: true, value };
      } catch (e) {
        if (status(e) === 404) {
          missing.add(r.id);
          outcome.missing = true;
          console.warn(`[gemini] key #${r.n} model=${r.model} not found (404), skipping this route`);
        } else if (isQuota(e)) {
          outcome.quota = true;
          exhaustedUntil.set(r.key, Date.now() + retryDelayMs(e));
          console.warn(`[gemini] key #${r.n} quota exhausted, trying next`);
        } else if (status(e) >= 500 || !status(e)) {
          outcome.busy = true;
          busyUntil.set(r.id, Date.now() + LLM_ROUTE_COOLDOWN_MS);
          console.warn(`[gemini] key #${r.n} model=${r.model} failed (${status(e) || "network"}), resting ${LLM_ROUTE_COOLDOWN_MS / 1000}s`);
        } else {
          console.error(`[gemini] request rejected (${status(e)}) model=${r.model}`);
          throw new AiError("The AI request failed");
        }
      }
    }
    return { done: false };
  };

  const routes = (ignoreBusy: boolean): Route[] => {
    const now = Date.now();
    const list = models.flatMap((model) =>
      all.map((key, i) => ({ id: `${i + 1}:${model}`, key, n: i + 1, model })),
    ).filter((r) => !missing.has(r.id) && (exhaustedUntil.get(r.key) ?? 0) <= now);
    const ready = list.filter((r) => ignoreBusy || (busyUntil.get(r.id) ?? 0) <= now);
    const use = ready.length ? ready : list; // everything cooling down: try anyway rather than fail without a call
    return [...use.filter((r) => r.id === lastGood), ...use.filter((r) => r.id !== lastGood)];
  };

  const first = routes(false);
  let res = await attempt(first);
  if (res.done) return res.value;

  if (outcome.busy) {
    await sleep(RETRY_PAUSE_MS);
    res = await attempt(routes(true).filter((r) => !missing.has(r.id)));
    if (res.done) return res.value;
  }

  if (!first.length && !outcome.busy && !outcome.missing) throw new QuotaError();
  if (outcome.busy) throw new AiError("AI is busy, try again in a moment");
  if (outcome.quota) throw new QuotaError();
  if (outcome.missing) {
    console.error(`[gemini] request rejected (404) model=${models.join(",")} on every key`);
    throw new AiError("The AI model is not available. Ask an admin to check the model settings.");
  }
  throw new AiError("The AI request failed");
}
