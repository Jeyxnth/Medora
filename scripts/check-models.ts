// Prints the model ids your Groq key can use. Pick one for GROQ_CHAT_MODEL / GROQ_WHISPER_MODEL.
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  if (!process.env.GROQ_API_KEY) return console.error("GROQ_API_KEY is not set in .env.local");
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
  });
  if (!res.ok) return console.error(`Groq returned ${res.status} ${res.statusText}`);
  const { data } = (await res.json()) as { data: { id: string }[] };
  const ids = data.map((m) => m.id).sort();
  const whisper = ids.filter((id) => id.includes("whisper"));
  const chat = ids.filter((id) => !whisper.includes(id) && !/guard|tts|playai|orpheus/i.test(id));
  console.log("Chat models (GROQ_CHAT_MODEL):\n  " + chat.join("\n  "));
  console.log("\nTranscription models (GROQ_WHISPER_MODEL):\n  " + whisper.join("\n  "));
}
main();
