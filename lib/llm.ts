import Groq from "groq-sdk";
import {
  DEEPSEEK_MODEL, GEMINI_FALLBACK_MODELS, GEMINI_MODEL, GEMINI_VISION_MODEL, GROQ_CHAT_MODEL, LLM_PROVIDERS,
  OPENROUTER_FALLBACK_MODELS, OPENROUTER_MODEL, OPENROUTER_VISION_FALLBACK_MODELS, OPENROUTER_VISION_MODEL,
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

type Route = { id: string; run: () => Promise<unknown> };

// Routes for one request, in LLM_PROVIDERS order. A provider without a key (or a route without a model) is skipped.
function routesFor(a: Args): Route[] {
  const vision = !!a.images?.length;
  const routes: Route[] = [];
  const openai = (provider: string, url: string, key: string, model: string, headers?: Record<string, string>) =>
    routes.push({ id: `${provider}:${model}`, run: () => chatJSON({ url, key, model, system: a.system, prompt: a.prompt, images: a.images, schema: a.schema, headers }) });

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

const COOLDOWN_MS = 75_000;
const cooling = new Map<string, number>(); // route id -> time it may be used again (in memory only)

const statusOf = (e: unknown) =>
  e instanceof RouteError ? e.status : e instanceof AiError ? "ai" : (e as { status?: number })?.status ?? "error";

// Tries each route once, in order. A failed route (429, 5xx, timeout, network, unreadable answer) goes on a short
// cooldown and the next route is tried. Throws AiError with a message that is safe to show to the user.
export async function generateJSON<T = unknown>(args: Args): Promise<T> {
  const all = routesFor(args);
  if (!all.length) throw new AiError("AI is not configured. Check the provider settings.");

  const now = Date.now();
  const ready = all.filter((r) => (cooling.get(r.id) ?? 0) <= now);
  for (const r of ready.length ? ready : all) { // everything cooling down: try once rather than fail without a call
    try {
      return (await r.run()) as T;
    } catch (e) {
      cooling.set(r.id, Date.now() + COOLDOWN_MS);
      console.warn(`[ai] route ${r.id} failed (${statusOf(e)}), cooling down 75s`);
    }
  }
  throw new AiError("AI is busy, try again");
}
