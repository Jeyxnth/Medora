// Mock test of the failover in lib/llm.ts runRoutes(). Never calls a real provider and never really sleeps.
// Usage: npm run check:retry
import type { Route } from "../lib/llm";
import { AiError, RouteError } from "../lib/gemini-client";

// Fake Gemini keys and a fake Groq key, set before lib/llm is loaded. Nothing here ever reaches the network.
process.env.GEMINI_API_KEY = "fake-key-one";
process.env.GEMINI_API_KEY_2 = "fake-key-two";
process.env.GEMINI_API_KEYS = "fake-key-two,fake-key-three";
process.env.GROQ_API_KEY = "fake-groq-key";
process.env.GEMINI_MODEL = "model-a";
process.env.GEMINI_VISION_MODEL = "model-v";
process.env.GEMINI_FALLBACK_MODELS = "model-b";
process.env.LLM_PROVIDERS = "gemini,groq";
process.env.LLM_VISION_PROVIDERS = "gemini,groq,ollama";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

// A fake route: plays the given outcomes in order (an Error is thrown, anything else is returned), then repeats the last one.
function fake(id: string, outcomes: (string | RouteError)[]) {
  const route: Route & { calls: number; lastMs: number } = {
    id, calls: 0, lastMs: 0,
    run: async (ms: number) => {
      route.lastMs = ms;
      const o = outcomes[Math.min(route.calls++, outcomes.length - 1)];
      if (o instanceof Error) throw o;
      return o;
    },
  };
  return route;
}

// Fake clock: sleeping just moves time forward and records the wait.
function clock() {
  let t = 1_000_000;
  const waits: number[] = [];
  return { waits, now: () => t, advance: (ms: number) => { t += ms; }, sleep: async (ms: number) => { waits.push(ms); t += ms; } };
}
const deps = (c: ReturnType<typeof clock>, cooling = new Map<string, number>()) =>
  ({ sleep: c.sleep, now: c.now, cooling, retryDelayMs: 3000, retryAttempts: 1, cooldownMs: 10_000, callTimeoutMs: 15_000, budgetMs: 50_000 });

const log = console.warn;
console.warn = () => {}; // keep the output to the PASS/FAIL lines

async function main() {
  const { runRoutes } = await import("../lib/llm");
  // 1. success on the first try
  {
    const c = clock(); const a = fake("a", ["ok-a"]); const b = fake("b", ["ok-b"]);
    const r = await runRoutes([a, b], deps(c));
    check("success on first try", r === "ok-a" && a.calls === 1 && b.calls === 0 && c.waits.length === 0, `calls a=${a.calls} b=${b.calls}, waits=${c.waits}`);
  }
  // 2. 429, then success on the retry of the same route
  {
    const c = clock(); const a = fake("a", [new RouteError(429), "ok-a"]); const b = fake("b", ["ok-b"]);
    const r = await runRoutes([a, b], deps(c));
    check("429 then success on retry (same route, after 3s)", r === "ok-a" && a.calls === 2 && b.calls === 0 && c.waits.join() === "3000", `calls a=${a.calls}, waits=${c.waits}`);
  }
  // 3. 429 twice, then the next route succeeds
  {
    const c = clock(); const cool = new Map<string, number>();
    const a = fake("a", [new RouteError(429)]); const b = fake("b", ["ok-b"]);
    const r = await runRoutes([a, b], deps(c, cool));
    check("429 twice, next route succeeds (one retry only)", r === "ok-b" && a.calls === 2 && b.calls === 1 && c.waits.join() === "3000", `calls a=${a.calls} b=${b.calls}, waits=${c.waits}`);
    check("failed route rests for 10s", cool.get("a") === c.now() + 10_000, `rest until +${(cool.get("a")! - c.now()) / 1000}s`);
  }
  // 4. 404, 400, 401, 402, 403 and an unreadable answer: no retry
  for (const status of [404, 400, 401, 402, 403, "unreadable"] as const) {
    const c = clock(); const a = fake("a", [new RouteError(status)]); const b = fake("b", ["ok-b"]);
    const r = await runRoutes([a, b], deps(c));
    check(`${status} skips the retry`, r === "ok-b" && a.calls === 1 && c.waits.length === 0, `a calls=${a.calls}, waits=${c.waits}`);
  }
  // 5. retryable statuses are retried once
  for (const status of [502, 503, 504, "timeout", "network"] as const) {
    const c = clock(); const a = fake("a", [new RouteError(status), "ok-a"]);
    const r = await runRoutes([a], deps(c));
    check(`${status} is retried once`, r === "ok-a" && a.calls === 2 && c.waits.join() === "3000");
  }
  // 6. a route on cooldown is skipped for 10 seconds, then used again
  {
    const c = clock(); const cool = new Map<string, number>();
    const a = fake("a", [new RouteError(404)]); const b = fake("b", ["ok-b"]);
    await runRoutes([a, b], deps(c, cool)); // a fails, rests
    c.advance(5000);
    await runRoutes([a, b], deps(c, cool));
    check("route on cooldown is skipped (at +5s)", a.calls === 1 && b.calls === 2, `a calls=${a.calls}`);
    c.advance(5001);
    await runRoutes([a, b], deps(c, cool));
    check("route is used again after 10s", a.calls === 2, `a calls=${a.calls}`);
  }
  // 7. Retry-After
  {
    const c = clock(); const a = fake("a", [new RouteError(429, 2000), "ok-a"]);
    const r = await runRoutes([a], deps(c));
    check("Retry-After 2s replaces the 3s wait", r === "ok-a" && c.waits.join() === "2000", `waits=${c.waits}`);
  }
  {
    const c = clock(); const a = fake("a", [new RouteError(429, 8000), "ok-a"]); const b = fake("b", ["ok-b"]);
    const r = await runRoutes([a, b], deps(c));
    check("Retry-After over 5s skips the retry", r === "ok-b" && a.calls === 1 && c.waits.length === 0, `a calls=${a.calls}, waits=${c.waits}`);
  }
  // 8. everything fails: friendly error, bounded wait, no whole-list retry
  {
    const c = clock(); const a = fake("a", [new RouteError(503)]); const b = fake("b", [new RouteError(429)]); const d = fake("d", [new RouteError(404)]);
    let msg = ""; let isAi = false;
    try { await runRoutes([a, b, d], deps(c)); } catch (e) { msg = (e as Error).message; isAi = e instanceof AiError; }
    check("all routes failing gives the friendly error", isAi && msg === "AI is busy, try again", msg);
    check("total wait is bounded (2 retries x 3s) and no whole-list retry", c.waits.join() === "3000,3000" && a.calls === 2 && b.calls === 2 && d.calls === 1, `waits=${c.waits}, calls=${a.calls},${b.calls},${d.calls}`);
  }
  // 9. every route hangs (fake clock): each call runs to its timeout; the friendly error comes back inside the 50s budget
  {
    const c = clock(); const t0 = c.now();
    const hang = (id: string) => ({ id, calls: 0, run: async function (this: { calls: number }, ms: number) { this.calls++; await c.sleep(ms); throw new RouteError("timeout"); } });
    const routes = [hang("h1"), hang("h2"), hang("h3")];
    let msg = "";
    try { await runRoutes(routes as unknown as Route[], deps(c)); } catch (e) { msg = (e as Error).message; }
    const elapsed = c.now() - t0;
    check("all routes hang: friendly error within the 50s budget", msg === "AI is busy, try again" && elapsed <= 50_000, `simulated ${elapsed / 1000}s, msg="${msg}"`);
    check("retry wait counted against the budget", c.waits.includes(3000) && elapsed <= 50_000, `waits=${c.waits}`);
  }
  // 10. real timers: promises that never settle are cut off by the call timeout and the budget
  {
    const never = (id: string): Route => ({ id, run: () => new Promise(() => {}) });
    const t0 = Date.now(); let msg = "";
    try {
      await runRoutes([never("n1"), never("n2"), never("n3")], { cooling: new Map(), retryDelayMs: 20, retryAttempts: 1, cooldownMs: 1000, callTimeoutMs: 40, budgetMs: 200 });
    } catch (e) { msg = (e as Error).message; }
    const ms = Date.now() - t0;
    check("never-settling routes are cut off, error inside the budget (real timers)", msg === "AI is busy, try again" && ms < 400, `${ms} ms of a 200 ms budget`);
  }
  // 11. Gemini keys x models, Groq last for text only
  {
    const { routesFor } = await import("../lib/llm");
    const text = routesFor({ system: "s", prompt: "p", schema: {} }).map((r) => r.id);
    check("text routes: model-a on every key (duplicates removed), then the fallbacks, then Groq last",
      text.join() === "gemini#1:model-a,gemini#2:model-a,gemini#3:model-a,gemini#1:model-v,gemini#2:model-v,gemini#3:model-v,gemini#1:model-b,gemini#2:model-b,gemini#3:model-b,groq:openai/gpt-oss-120b",
      text.join(" "));
    const img = routesFor({ system: "s", prompt: "p", schema: {}, images: [{ mimeType: "image/jpeg", data: "x" }] }).map((r) => r.id);
    check("image routes: vision model first, never Groq, only valid provider names", img[0] === "gemini#1:model-v" && img.every((id) => id.startsWith("gemini#")), img.join(" "));
    check("no key appears in a route id", ![...text, ...img].some((id) => id.includes("fake-")));
  }
  // 12. image call: every Gemini route fails, nothing else is tried
  {
    const c = clock();
    const gem = ["gemini#1:model-v", "gemini#2:model-v"].map((id) => fake(id, [new RouteError(503)]));
    let msg = "";
    try { await runRoutes(gem, deps(c)); } catch (e) { msg = (e as Error).message; }
    check("image call with all Gemini routes failing gives the friendly error", msg === "AI is busy, try again" && gem.every((g) => g.calls === 2), msg);
  }
  // 13. text call: Gemini fails, Groq answers
  {
    const c = clock();
    const gem = fake("gemini#1:model-a", [new RouteError(404)]); const groq = fake("groq:x", ["ok-groq"]);
    const r = await runRoutes([gem, groq], deps(c));
    check("text call: Gemini failing falls back to Groq", r === "ok-groq" && gem.calls === 1 && groq.calls === 1);
  }
  console.warn = log;
  console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed (mocked, no provider was called)");
  if (failed) process.exit(1);
}
main();
