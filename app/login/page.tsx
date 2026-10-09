"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileCheck, HeartPulse, Link as LinkIcon, Lock, Mail, Quote, Stethoscope, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const POINTS = [
  { icon: Quote, title: "Cited notes", text: "Every statement in a draft links back to the conversation." },
  { icon: LinkIcon, title: "Source-linked records", text: "Every fact keeps a link to its document or note." },
  { icon: FileCheck, title: "Doctor approval", text: "Nothing is saved until a clinician reviews and approves." },
];

// Original flat cloud shape (circles and a rounded base), white at about 70% opacity.
function Cloud({ className }: { className: string }) {
  return (
    <svg aria-hidden viewBox="0 0 200 80" className={`absolute ${className}`}>
      <g fill="#fff" fillOpacity="0.7">
        <circle cx="62" cy="48" r="24" />
        <circle cx="98" cy="34" r="31" />
        <circle cx="138" cy="46" r="25" />
        <rect x="38" y="46" width="124" height="28" rx="14" />
      </g>
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [heroLoaded, setHeroLoaded] = useState(false); // public/login-hero.png is optional

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
  const input = "w-full rounded-xl border border-[#8A9BB0] bg-white py-3 pl-10 pr-3 text-sm text-[#0F2547] placeholder:text-[#64748B] outline-none focus:border-[#0E8F7E] focus:ring-2 focus:ring-[#0E8F7E]/30";
  const pill = "flex flex-1 basis-40 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-[#CFE3EF] bg-white px-4 py-2.5 text-sm font-medium text-[#0F2547] hover:border-[#0E8F7E] hover:bg-[#E3F3F0]";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#F4FAFE] text-[#0F2547]">
      {/* decoration: flat circles and clouds, behind everything, never clickable */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full bg-[#DCEEFA]" />
        <div className="absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-[#E3F2FB]" />
        <div className="absolute -bottom-28 -left-20 h-80 w-80 rounded-full bg-[#E3F2FB]" />
        <Cloud className="left-[8%] top-10 w-44" />
        <Cloud className="right-[30%] top-24 hidden w-32 sm:block" />
        <Cloud className="bottom-24 right-[8%] hidden w-40 sm:block" />
      </div>

      <div className="relative z-10 grid min-h-screen lg:grid-cols-2">
        {/* left: brand, headline, points, hero (form comes first on narrow screens) */}
        <div className="relative order-2 flex flex-col justify-between gap-10 px-6 py-10 sm:px-12 lg:order-1 lg:px-16 lg:py-14">
          <div className="max-w-md xl:max-w-[21rem] 2xl:max-w-[26rem]">
            <h1 className="text-3xl font-bold tracking-tight text-[#0E8F7E]">Medora</h1>
            <p className="mt-1 text-base text-[#334155]">AI drafts. Doctors decide.</p>

            <p className="mt-10 text-4xl font-extrabold leading-[1.1] tracking-tight text-[#0F2547] xl:text-[2.6rem] 2xl:text-5xl">
              Smarter<br /><span className="text-[#0E8F7E]">Clinical Notes</span><br />for Better Care
            </p>
            <p className="mt-4 text-base text-[#5B6B7F]">
              Turn conversations into structured, source-linked drafts, reviewed and approved by clinicians.
            </p>

            <ul className="mt-8 space-y-5">
              {POINTS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E3F3F0] text-[#0E8F7E]"><Icon size={20} /></span>
                  <div>
                    <p className="font-bold text-[#0F2547]">{title}</p>
                    <p className="text-sm text-[#5B6B7F]">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-[#5B6B7F]">Synthetic demo data only.</p>

          {/* hero: sky-blue circle (with the photo inside when public/login-hero.png exists) and two floating tiles */}
          <div aria-hidden className="pointer-events-none absolute right-0 top-1/2 hidden h-[260px] w-[260px] -translate-y-1/2 translate-x-16 xl:block 2xl:h-[340px] 2xl:w-[340px]">
            <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-full bg-[#7FCBF0]" />
            <div className="relative h-full w-full overflow-hidden rounded-full bg-[#7FCBF0]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/login-hero.png" alt="" onLoad={() => setHeroLoaded(true)} onError={() => setHeroLoaded(false)}
                className={`h-full w-full rounded-full object-cover ${heroLoaded ? "" : "hidden"}`}
              />
            </div>
            <span className="absolute -top-2 right-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#0E8F7E] shadow-[0_6px_20px_rgba(15,37,71,0.15)]"><HeartPulse size={26} /></span>
            <span className="absolute -left-4 bottom-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#2B8AC4] shadow-[0_6px_20px_rgba(15,37,71,0.15)]"><Stethoscope size={26} /></span>
          </div>
        </div>

        {/* right: sign-in card */}
        <div className="order-1 flex items-center justify-center px-4 py-10 lg:order-2">
          <div className="w-full max-w-md">
            <div className="rounded-[24px] bg-white p-8 shadow-[0_12px_40px_rgba(15,37,71,0.10)] sm:p-10">
              <h2 className="text-3xl font-bold text-[#0F2547]">Sign in</h2>
              <p className="mb-7 mt-1 text-sm text-[#5B6B7F]">Use your clinic account.</p>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="relative">
                  <Mail size={18} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
                  <input className={input} type="email" placeholder="Email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="relative">
                  <Lock size={18} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
                  <input className={input} type="password" placeholder="Password" aria-label="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                {error && <p className="text-sm text-[#B91C1C]">{error}</p>}
                {/* white on #0E8F7E is 4.0:1, so the label is large bold text (3:1 is enough) */}
                <button disabled={loading} className="w-full rounded-xl bg-[#0E8F7E] py-3 text-[19px] font-bold text-white hover:bg-[#0B7A6B] disabled:opacity-60">
                  {loading ? "Signing in..." : "Sign in"}
                </button>
              </form>

              <div className="my-6 flex items-center gap-3 text-sm text-[#5B6B7F]">
                <span className="h-px flex-1 bg-[#D6E4EE]" /> or <span className="h-px flex-1 bg-[#D6E4EE]" />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => fill("doctor@demo.com")} className={pill}><Stethoscope size={16} className="text-[#0E8F7E]" /> Fill demo doctor</button>
                <button type="button" onClick={() => fill("nurse@demo.com")} className={pill}><UserRound size={16} className="text-[#0E8F7E]" /> Fill demo nurse</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
