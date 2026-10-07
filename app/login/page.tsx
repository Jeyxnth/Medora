"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileCheck2, Link2, Quote } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const POINTS = [
  { icon: Quote, title: "Cited notes", text: "Every statement in a draft links back to the conversation." },
  { icon: Link2, title: "Source-linked records", text: "Every fact keeps a link to its document or note." },
  { icon: FileCheck2, title: "Doctor approval", text: "Nothing is saved until a clinician reviews and approves." },
];

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
  const input = "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";
  const chip = "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:border-teal-400 hover:text-teal-700";

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-between gap-8 bg-gradient-to-br from-teal-700 to-teal-900 px-8 py-10 text-white sm:px-12 lg:px-16 lg:py-16">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Medora</h1>
          <p className="mt-2 text-lg text-teal-100">AI drafts. Doctors decide.</p>
        </div>
        <ul className="space-y-5">
          {POINTS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15"><Icon size={18} /></span>
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-teal-100">{text}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="hidden text-xs text-teal-200 lg:block">Synthetic demo data only.</p>
      </div>

      <div className="flex items-center justify-center bg-slate-50 px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="card p-8">
            <h2 className="mb-1 text-xl font-semibold text-slate-900">Sign in</h2>
            <p className="mb-6 text-sm text-slate-500">Use your clinic account.</p>
            <form onSubmit={onSubmit} className="space-y-3">
              <input className={input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input className={input} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button disabled={loading} className="w-full rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60">
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" onClick={() => fill("doctor@demo.com")} className={chip}>Fill demo doctor</button>
            <button type="button" onClick={() => fill("nurse@demo.com")} className={chip}>Fill demo nurse</button>
          </div>
        </div>
      </div>
    </div>
  );
}
