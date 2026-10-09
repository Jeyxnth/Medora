// Chat-completions call for OpenAI-compatible providers (OpenRouter, DeepSeek). Plain fetch, no SDK.
// Never logs keys, prompts or images.

export type Image = { mimeType: string; data: string }; // data = base64

// A failed route. `status` is the HTTP code, or "timeout" / "network" / "unreadable".
export class RouteError extends Error {
  constructor(public status: number | "timeout" | "network" | "unreadable", public retryAfterMs?: number) { super(`route failed (${status})`); }
}

// Retry-After header in seconds -> ms (the date form is ignored).
const retryAfter = (res: Response) => {
  const h = res.headers.get("retry-after");
  const s = h === null || h.trim() === "" ? NaN : Number(h);
  return Number.isFinite(s) && s >= 0 ? Math.round(s * 1000) : undefined;
};

export type ChatArgs = {
  url: string;
  key: string;
  model: string;
  system: string;
  prompt: string;
  images?: Image[];
  schema: Record<string, unknown>;
  timeoutMs?: number;
  headers?: Record<string, string>;
};

// Model output -> object. Tolerates code fences, <think> blocks and text around the JSON.
export function parseJsonLoose(raw: string): unknown {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new RouteError("unreadable");
  }
}

export async function chatJSON(a: ChatArgs): Promise<unknown> {
  const userContent = a.images?.length
    ? [
        ...a.images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mimeType};base64,${i.data}` } })),
        { type: "text", text: a.prompt },
      ]
    : a.prompt;

  let res: Response;
  try {
    res = await fetch(a.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${a.key}`, "Content-Type": "application/json", ...a.headers },
      body: JSON.stringify({
        model: a.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${a.system}\nReply with JSON only, no other text, matching this JSON schema:\n${JSON.stringify(a.schema)}` },
          { role: "user", content: userContent },
        ],
      }),
      signal: AbortSignal.timeout(a.timeoutMs ?? 40_000),
    });
  } catch (e) {
    throw new RouteError((e as Error).name === "TimeoutError" ? "timeout" : "network");
  }
  if (!res.ok) throw new RouteError(res.status, retryAfter(res));

  const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string | null } }[] } | null;
  const content = body?.choices?.[0]?.message?.content;
  if (!content) throw new RouteError("unreadable");
  try {
    return parseJsonLoose(content);
  } catch {
    throw new RouteError("unreadable");
  }
}
