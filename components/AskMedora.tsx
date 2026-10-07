"use client";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, FileText, Loader2, Send, Sparkles } from "lucide-react";
import type { AskResult } from "@/app/api/ask/route";

const SUGGESTIONS = [
  "What was the latest creatinine and how has it changed?",
  "Is she on anything that could affect her kidneys?",
  "What happened at the last consultation?",
];

export default function AskMedora({ patientId }: { patientId: string }) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(body: { question?: string; mode?: "summary" }) {
    setLoading(true);
    setError(null);
    setAsked(body.mode === "summary" ? "Patient summary" : body.question ?? "");
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, ...body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      setResult(json);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  const send = (q: string) => {
    if (!q.trim() || loading) return;
    setQuestion(q);
    run({ question: q.trim() });
  };
  const chip = "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:border-teal-400 hover:bg-teal-50 disabled:opacity-50";

  return (
    <div className="card p-5">
      <h2 className="card-title mb-3 flex items-center gap-2"><Sparkles size={16} className="text-teal-600" /> Ask Medora</h2>

      <form onSubmit={(e) => { e.preventDefault(); send(question); }} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
          placeholder="Ask about this patient, e.g. When was her last HbA1c?"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
        <button disabled={loading || !question.trim()} className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send
        </button>
        <button type="button" disabled={loading} onClick={() => run({ mode: "summary" })} className="rounded-lg border border-teal-600 px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-50">
          Summarize patient
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => <button key={s} type="button" disabled={loading} onClick={() => send(s)} className={chip}>{s}</button>)}
      </div>

      {loading && (
        <div className="mt-4 space-y-2" role="status">
          <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 size={16} className="animate-spin text-teal-600" /> Reading approved records...</p>
          <div className="animate-pulse space-y-2"><div className="h-3 w-11/12 rounded bg-slate-200" /><div className="h-3 w-3/4 rounded bg-slate-200" /><div className="h-3 w-1/2 rounded bg-slate-100" /></div>
        </div>
      )}
      {error && !loading && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {result && !loading && (
        <div className="mt-4 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{asked}</p>
          {result.not_found && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
              Not found in the approved records.
            </p>
          )}
          <ul className="space-y-2.5">
            {result.answer.map((s, i) => (
              <li key={i} className="text-sm text-slate-800">
                <p>{s.text}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {s.sources.map((id) => {
                    const src = result.sources[id];
                    return src && (
                      <Link key={id} href={src.href} className="flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800 ring-1 ring-teal-200 hover:bg-teal-100">
                        <FileText size={11} /> {src.label}
                      </Link>
                    );
                  })}
                  {!s.verified && (
                    <span title={s.reason} className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
                      <AlertTriangle size={11} /> Could not be verified against the cited record
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {result.follow_ups.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {result.follow_ups.map((f) => <button key={f} type="button" onClick={() => send(f)} className={chip}>{f}</button>)}
            </div>
          )}
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">AI-generated from approved records only. Verify against the source before acting.</p>
    </div>
  );
}
