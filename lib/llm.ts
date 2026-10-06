import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import { GEMINI_MODEL, GROQ_TEXT_MODEL } from "./config";

type Image = { mimeType: string; data: string }; // data = base64
type Args = {
  system: string;
  prompt: string;
  images?: Image[];
  schema: Record<string, unknown>; // JSON schema
  thinking?: boolean; // default false: no thinking, temperature 0
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const is429 = (e: unknown) =>
  (e as { status?: number })?.status === 429 || String((e as Error)?.message).includes("429");

async function callGemini({ system, prompt, images, schema, thinking = false }: Args) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const parts = [
    ...(images ?? []).map((i) => ({ inlineData: { mimeType: i.mimeType, data: i.data } })),
    { text: prompt },
  ];
  const res = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      responseJsonSchema: schema,
      ...(thinking ? {} : { temperature: 0, thinkingConfig: { thinkingBudget: 0 } }),
    },
  });
  return JSON.parse(res.text ?? "");
}

async function callGroq({ system, prompt, schema }: Args) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const res = await groq.chat.completions.create({
    model: GROQ_TEXT_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: `${system}\nReply with JSON matching this schema:\n${JSON.stringify(schema)}` },
      { role: "user", content: prompt },
    ],
  });
  return JSON.parse(res.choices[0].message.content ?? "");
}

export async function generateJSON<T = unknown>(args: Args): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await callGemini(args);
    } catch (e) {
      if (!is429(e)) throw e;
      if (attempt < 3) {
        console.warn(`Gemini 429, retry ${attempt}/2 in 5s`);
        await sleep(5000);
        continue;
      }
      if (args.images?.length) throw e; // Groq text model can't read images
      return callGroq(args);
    }
  }
}
