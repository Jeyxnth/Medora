// Mock test of the failover in lib/llm.ts runRoutes(). Never calls a real provider and never really sleeps.
// Usage: npm run check:retry
import { runRoutes, type Route } from "../lib/llm";
import { RouteError } from "../lib/openai-compat";
import { AiError } from "../lib/gemini-client";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

// A fake route: plays the given outcomes in order (an Error is thrown, anything else is returned), then repeats the last one.
function fake(id: string, outcomes: (string | RouteError)[], local?: { timeoutMs: number }) {
  const route: Route & { calls: number; lastMs: number } = {
    id, calls: 0, lastMs: 0, local,
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
  // 11. API routes spend the whole budget, then local Ollama still runs with its own timeout
  {
    const c = clock();
    const hang = (id: string) => ({ id, run: async (ms: number) => { await c.sleep(ms); throw new RouteError("timeout"); } });
    const ollama = fake("ollama:qwen", ["ok-ollama"], { timeoutMs: 120_000 });
    const r = await runRoutes([hang("h1"), hang("h2"), hang("h3"), ollama] as Route[], deps(c));
    check("API routes fail (budget spent), then Ollama succeeds", r === "ok-ollama" && ollama.calls === 1, `ollama calls=${ollama.calls}`);
    check("Ollama gets its own timeout (120s), not what is left of the budget", ollama.lastMs === 120_000, `timeout ${ollama.lastMs} ms`);
  }
  // 12. API fails and Ollama is not running: friendly error, one attempt, no retry
  {
    const c = clock();
    const api = fake("openrouter:x", [new RouteError(404)]);
    const ollama = fake("ollama:qwen", [new RouteError("network")], { timeoutMs: 120_000 });
    let msg = "";
    try { await runRoutes([api, ollama], deps(c)); } catch (e) { msg = (e as Error).message; }
    check("API fails and Ollama not running gives the friendly error", msg === "AI is busy, try again", msg);
    check("Ollama not running: tried once, no retry, no wait", ollama.calls === 1 && c.waits.length === 0, `calls=${ollama.calls}, waits=${c.waits}`);
  }
  // 13. Ollama timeout: no retry
  {
    const c = clock();
    const ollama = fake("ollama:qwen", [new RouteError("timeout")], { timeoutMs: 120_000 });
    let msg = "";
    try { await runRoutes([ollama], deps(c)); } catch (e) { msg = (e as Error).message; }
    check("Ollama timeout is not retried", msg === "AI is busy, try again" && ollama.calls === 1 && c.waits.length === 0, `calls=${ollama.calls}`);
  }
  // 14. API succeeds: Ollama is never called
  {
    const c = clock();
    const api = fake("openrouter:x", ["ok-api"]);
    const ollama = fake("ollama:qwen", ["ok-ollama"], { timeoutMs: 120_000 });
    const r = await runRoutes([api, ollama], deps(c));
    check("API succeeds, Ollama is never called", r === "ok-api" && ollama.calls === 0, `ollama calls=${ollama.calls}`);
  }
  console.warn = log;
  console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed (mocked, no provider was called)");
  if (failed) process.exit(1);
}
main();
