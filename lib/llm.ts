import Groq from "groq-sdk";
import {
  DEEPSEEK_MODEL, GEMINI_FALLBACK_MODELS, GEMINI_MODEL, GEMINI_VISION_MODEL, GROQ_CHAT_MODEL, LLM_PROVIDERS,
  LLM_CALL_TIMEOUT_MS, LLM_RETRY_ATTEMPTS, LLM_RETRY_DELAY_MS, LLM_ROUTE_COOLDOWN_MS, LLM_TOTAL_BUDGET_MS, OPENROUTER_FALLBACK_MODELS, OPENROUTER_MODEL, OPENROUTER_VISION_FALLBACK_MODELS, OPENROUTER_VISION_MODEL,
} from "./config";
import { AiError, withGemini } from "./gemini-client";
import { chatJSON, RouteError, type Image } from "./openai-compat";

type Args = {
  system: string;
  prompt: string;
  images?: Image[];
  schema: Record<string, unknown>; // JSON schema
  thinking?: boolean; // Gemini only: default false (no thinking, temperature 0)
};

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

async function callGemini({ system, prompt, images, schema, thinking = false }: Args) {
  const parts = [
    ...(images ?? []).map((i) => ({ inlineData: { mimeType: i.mimeType, data: i.data } })),
    { text: prompt },
  ];
  const primary = images?.length ? GEMINI_VISION_MODEL : GEMINI_MODEL;
  const models = [...new Set([primary, GEMINI_MODEL, GEMINI_VISION_MODEL, ...GEMINI_FALLBACK_MODELS])];
  const res = await withGemini((ai, model) => ai.models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      responseJsonSchema: schema,
      ...(thinking ? {} : { temperature: 0, thinkingConfig: { thinkingBudget: 0 } }),
    },
  }), models);
  return JSON.parse(res.text ?? "");
}

async function callGroq({ system, prompt, schema }: Args) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const res = await groq.chat.completions.create({
    model: GROQ_CHAT_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: `${system}\nReply with JSON matching this schema:\n${JSON.stringify(schema)}` },
      { role: "user", content: prompt },
    ],
  });
  return JSON.parse(res.choices[0].message.content ?? "");
}

// Routes for one request, in LLM_PROVIDERS order. A provider without a key (or a route without a model) is skipped.
function routesFor(a: Args): Route[] {
  const vision = !!a.images?.length;
  const routes: Route[] = [];
  const openai = (provider: string, url: string, key: string, model: string, headers?: Record<string, string>) =>
    routes.push({ id: `${provider}:${model}`, run: (timeoutMs) => chatJSON({ url, key, model, system: a.system, prompt: a.prompt, images: a.images, schema: a.schema, headers, timeoutMs }) });

  for (const p of LLM_PROVIDERS) {
    if (p === "openrouter" && process.env.OPENROUTER_API_KEY) {
      const models = vision ? [OPENROUTER_VISION_MODEL, ...OPENROUTER_VISION_FALLBACK_MODELS] : [OPENROUTER_MODEL, ...OPENROUTER_FALLBACK_MODELS];
      for (const m of new Set(models.filter(Boolean))) openai("openrouter", OPENROUTER_URL, process.env.OPENROUTER_API_KEY, m, { "X-Title": "Medora" });
    } else if (p === "deepseek" && process.env.DEEPSEEK_API_KEY && !vision) { // text only
      openai("deepseek", DEEPSEEK_URL, process.env.DEEPSEEK_API_KEY, DEEPSEEK_MODEL);
    } else if (p === "gemini") {
      routes.push({ id: "gemini", run: () => callGemini(a) });
    } else if (p === "groq" && process.env.GROQ_API_KEY && !vision) {
      routes.push({ id: `groq:${GROQ_CHAT_MODEL}`, run: () => callGroq(a) });
    }
  }
  return routes;
}

// `run` gets the time it may take; routes that cannot enforce it themselves (Gemini, Groq) are cut off by runRoutes.
export type Route = { id: string; run: (timeoutMs: number) => Promise<unknown> };

const cooling = new Map<string, number>(); // route id -> time it may be used again (in memory only)

// 429, 502, 503, 504, timeouts and network errors are worth one more try on the same route. Everything else
// (400, 401, 402, 403, 404, other 5xx, unreadable answers, Gemini errors) goes straight to the next route.
const RETRYABLE = new Set<unknown>([429, 502, 503, 504, "timeout", "network"]);
const MAX_RETRY_AFTER_MS = 5000;

const statusOf = (e: unknown) =>
  e instanceof RouteError ? e.status : e instanceof AiError ? "ai" : (e as { status?: number })?.status ?? "error";

type Deps = {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  cooling?: Map<string, number>;
  retryDelayMs?: number;
  retryAttempts?: number;
  cooldownMs?: number;
  callTimeoutMs?: number;
  budgetMs?: number;
};

// Rejects with a "timeout" RouteError if the promise takes longer than ms.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const limit = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new RouteError("timeout")), ms); });
  return Promise.race([p, limit]).finally(() => clearTimeout(timer));
}

// Tries each route in order. A route that fails with a retryable error is retried (default once, after 3 s, or after
// its Retry-After if that is 1-5 s; a longer Retry-After skips the retry). After that the route rests for the cooldown
// (default 10 s) and the next route is tried. Each call is cut off after the call timeout, and the whole request
// (calls plus retry waits) has a time budget: once it is spent no further route is tried. No whole-list retry: if every
// route fails, throws a friendly AiError.
export async function runRoutes<T>(all: Route[], deps: Deps = {}): Promise<T> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const rest = deps.cooling ?? cooling;
  const delay = deps.retryDelayMs ?? LLM_RETRY_DELAY_MS;
  const attempts = deps.retryAttempts ?? LLM_RETRY_ATTEMPTS;
  const cooldown = deps.cooldownMs ?? LLM_ROUTE_COOLDOWN_MS;
  const callTimeout = deps.callTimeoutMs ?? LLM_CALL_TIMEOUT_MS;
  const deadline = now() + (deps.budgetMs ?? LLM_TOTAL_BUDGET_MS);

  if (!all.length) throw new AiError("AI is not configured. Check the provider settings.");
  const ready = all.filter((r) => (rest.get(r.id) ?? 0) <= now());

  for (const r of ready.length ? ready : all) { // everything resting: try each once rather than fail without a call
    for (let attempt = 0; ; attempt++) {
      const left = deadline - now();
      if (left <= 0) {
        console.warn("[ai] time budget spent, giving up");
        throw new AiError("AI is busy, try again");
      }
      try {
        const ms = Math.min(callTimeout, left);
        return (await withTimeout(r.run(ms), ms)) as T;
      } catch (e) {
        const status = statusOf(e);
        const after = e instanceof RouteError ? e.retryAfterMs : undefined;
        const wait = after !== undefined && after >= 1000 ? after : delay;
        const canRetry =
          attempt < attempts && RETRYABLE.has(status) && !(after !== undefined && after > MAX_RETRY_AFTER_MS) &&
          deadline - now() > wait; // the wait counts against the budget
        if (!canRetry) {
          rest.set(r.id, now() + cooldown);
          console.warn(`[ai] route ${r.id} failed (${status}), next route, resting ${cooldown / 1000}s`);
          break;
        }
        console.warn(`[ai] route ${r.id} failed (${status}), retrying in ${wait / 1000}s`);
        await sleep(wait);
      }
    }
  }
  throw new AiError("AI is busy, try again");
}

export const generateJSON = <T = unknown>(args: Args): Promise<T> => runRoutes<T>(routesFor(args));
