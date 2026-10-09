import Groq from "groq-sdk";
import {
  GEMINI_FALLBACK_MODELS, GEMINI_MODEL, GEMINI_VISION_MODEL, GROQ_CHAT_MODEL, LLM_CALL_TIMEOUT_MS, LLM_PROVIDERS,
  LLM_RETRY_ATTEMPTS, LLM_RETRY_DELAY_MS, LLM_ROUTE_COOLDOWN_MS, LLM_TOTAL_BUDGET_MS, LLM_VISION_PROVIDERS,
} from "./config";
import { AiError, geminiCall, geminiKeys, geminiRouteId, geminiRouteUsable, QuotaError, RouteError } from "./gemini-client";

type Image = { mimeType: string; data: string }; // data = base64
type Args = {
  system: string;
  prompt: string;
  images?: Image[];
  schema: Record<string, unknown>; // JSON schema
  thinking?: boolean; // Gemini only: default false (no thinking, temperature 0)
};

const parseJson = (text: string | undefined): unknown => {
  try {
    return JSON.parse(text ?? "");
  } catch {
    throw new RouteError("unreadable");
  }
};

async function callGemini(n: number, key: string, model: string, { system, prompt, images, schema, thinking = false }: Args) {
  const parts = [
    ...(images ?? []).map((i) => ({ inlineData: { mimeType: i.mimeType, data: i.data } })),
    { text: prompt },
  ];
  const res = await geminiCall(n, key, model, (ai, m) => ai.models.generateContent({
    model: m,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      responseJsonSchema: schema,
      ...(thinking ? {} : { temperature: 0, thinkingConfig: { thinkingBudget: 0 } }),
    },
  }));
  return parseJson(res.text);
}

async function callGroq({ system, prompt, schema }: Args) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  let content: string | null | undefined;
  try {
    const res = await groq.chat.completions.create({
      model: GROQ_CHAT_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${system}\nReply with JSON matching this schema:\n${JSON.stringify(schema)}` },
        { role: "user", content: prompt },
      ],
    });
    content = res.choices[0].message.content;
  } catch (e) {
    throw new RouteError((e as { status?: number })?.status ?? "network");
  }
  return parseJson(content ?? undefined);
}

// `run` gets the time it may take; routes that cannot enforce it themselves are cut off by runRoutes.
export type Route = { id: string; run: (timeoutMs: number) => Promise<unknown> };

// Routes for one request, in provider order. Gemini: every key x every model (the primary model on all keys first, then the
// fallback models); keys with no quota left and models that returned 404 are left out. Groq chat is the last route for
// TEXT calls only: images never go to Groq.
export function routesFor(a: Args): Route[] {
  const vision = !!a.images?.length;
  const routes: Route[] = [];

  for (const p of vision ? LLM_VISION_PROVIDERS : LLM_PROVIDERS) {
    if (p === "gemini") {
      const primary = vision ? GEMINI_VISION_MODEL : GEMINI_MODEL;
      const models = [...new Set([primary, GEMINI_MODEL, GEMINI_VISION_MODEL, ...GEMINI_FALLBACK_MODELS])];
      const keys = geminiKeys();
      for (const model of models) {
        keys.forEach((key, i) => {
          if (geminiRouteUsable(i + 1, key, model)) routes.push({ id: geminiRouteId(i + 1, model), run: () => callGemini(i + 1, key, model, a) });
        });
      }
    } else if (p === "groq" && process.env.GROQ_API_KEY && !vision) {
      routes.push({ id: `groq:${GROQ_CHAT_MODEL}`, run: () => callGroq(a) });
    }
  }
  return routes;
}

const cooling = new Map<string, number>(); // route id -> time it may be used again (in memory only)

// 429, 502, 503, 504, timeouts and network errors are worth one more try on the same route. Everything else
// (400, 401, 402, 403, 404, other 5xx, unreadable answers) goes straight to the next route.
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

export function generateJSON<T = unknown>(args: Args): Promise<T> {
  const routes = routesFor(args);
  // Keys are set but every route is left out: all keys are resting after a quota error.
  if (!routes.length && geminiKeys().length) return Promise.reject(new QuotaError());
  return runRoutes<T>(routes);
}
