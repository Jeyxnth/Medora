import Groq from "groq-sdk";
import { GEMINI_FALLBACK_MODELS, GEMINI_MODEL, GEMINI_VISION_MODEL, GROQ_CHAT_MODEL } from "./config";
import { AiError, withGemini } from "./gemini-client";

type Image = { mimeType: string; data: string }; // data = base64
type Args = {
  system: string;
  prompt: string;
  images?: Image[];
  schema: Record<string, unknown>; // JSON schema
  thinking?: boolean; // default false: no thinking, temperature 0
};

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

// Gemini (all keys) first; if that fails, a Groq text model for text-only requests.
// Throws AiError with a message that is safe to show to the user.
export async function generateJSON<T = unknown>(args: Args): Promise<T> {
  try {
    return await callGemini(args);
  } catch (e) {
    if (!(e instanceof AiError)) throw new AiError("The AI response could not be read, try again");
    if (args.images?.length || !process.env.GROQ_API_KEY) throw e; // Groq text model can't read images
    console.warn(`[ai] Gemini unavailable (${e.message}), falling back to Groq ${GROQ_CHAT_MODEL}`);
    try {
      return await callGroq(args);
    } catch (g) {
      console.error(`[ai] Groq fallback failed (${(g as { status?: number })?.status ?? "error"})`);
      throw new AiError(`${e.message}. The backup AI service is also unavailable.`);
    }
  }
}
