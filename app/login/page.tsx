"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push("/patients");
    router.refresh();
  }

  const fill = (e: string) => { setEmail(e); setPassword("demo1234"); };
  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-center text-3xl font-bold tracking-tight text-teal-700">Medora</h1>
        <p className="mb-6 mt-1 text-center text-sm text-slate-500">AI drafts. Doctors decide.</p>
        <form onSubmit={onSubmit} className="space-y-3">
          <input className={input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className={input} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button disabled={loading} className="w-full rounded-lg bg-teal-600 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60">
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => fill("doctor@demo.com")} className="flex-1 rounded-lg border border-slate-300 py-1.5 text-xs text-slate-600 hover:bg-slate-50">Fill demo doctor</button>
          <button type="button" onClick={() => fill("nurse@demo.com")} className="flex-1 rounded-lg border border-slate-300 py-1.5 text-xs text-slate-600 hover:bg-slate-50">Fill demo nurse</button>
        </div>
      </div>
    </div>
  );
}
