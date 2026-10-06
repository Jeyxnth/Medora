"use client";
import { useRef, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { SOAP_KEYS, type MedChange, type NoteContent, type SoapKey } from "@/lib/scribe";
import { approveNote, discardNote, saveNoteDraft } from "@/app/(app)/patients/[id]/notes/[noteId]/actions";

const ACTION_STYLE: Record<MedChange["action"], string> = {
  start: "bg-emerald-100 text-emerald-800",
  stop: "bg-red-100 text-red-800",
  change: "bg-sky-100 text-sky-800",
};

export default function NoteReview(p: {
  noteId: string; approved: boolean; isDoctor: boolean; initial: NoteContent;
}) {
  const ro = p.approved;
  const [soap, setSoap] = useState(p.initial.soap);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const transcript = useRef<HTMLDivElement>(null);

  const lit = hover ?? picked;
  const meds = p.initial.med_changes;

  const content = (): NoteContent => ({
    ...p.initial,
    soap: Object.fromEntries(
      SOAP_KEYS.map(({ key }) => [key, soap[key].map((x) => ({ ...x, text: x.text.trim() })).filter((x) => x.text)]),
    ) as NoteContent["soap"],
  });

  const setText = (k: SoapKey, i: number, text: string) =>
    setSoap({ ...soap, [k]: soap[k].map((x, j) => (j === i ? { ...x, text } : x)) });

  function jump(id: number) {
    setPicked(id);
    transcript.current?.querySelector(`#seg-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const run = (fn: () => Promise<{ error?: string } | void>, done?: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r?.error ?? done ?? null);
    });

  const chips = (sources: number[]) =>
    sources.map((n) => (
      <button key={n} type="button" onClick={() => jump(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)}
        className={`rounded px-1.5 py-0.5 text-xs font-medium ${lit === n ? "bg-teal-600 text-white" : "bg-teal-50 text-teal-700 hover:bg-teal-100"}`}>
        {n}
      </button>
    ));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Transcript</h2>
        <div ref={transcript} className="max-h-[75vh] space-y-2 overflow-auto pr-1 text-sm">
          {p.initial.segments.map((s) => (
            <div key={s.id} id={`seg-${s.id}`}
              className={`rounded-lg border-l-4 px-3 py-2 transition-colors ${s.speaker === "doctor" ? "border-teal-500" : s.speaker === "patient" ? "border-slate-400" : "border-slate-200"} ${lit === s.id ? "bg-amber-100" : "bg-slate-50"}`}>
              <span className={`mr-2 text-xs font-semibold uppercase ${s.speaker === "doctor" ? "text-teal-700" : "text-slate-500"}`}>
                {s.speaker === "doctor" ? "Doctor" : s.speaker === "patient" ? "Patient" : "Other"} <span className="font-normal text-slate-400">[{s.id}]</span>
              </span>
              <span className="text-slate-800">{s.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">SOAP note</span>
          {ro ? (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">Approved</span>
          ) : (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">Draft - needs review</span>
          )}
        </div>

        {SOAP_KEYS.map(({ key, label }) => (
          <section key={key} className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-900">{label}</h2>
            {soap[key].length === 0 && <p className="text-sm italic text-slate-400">Not discussed</p>}
            {soap[key].map((x, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-2">
                <textarea value={x.text} disabled={ro} rows={Math.max(1, Math.ceil(x.text.length / 55))}
                  onChange={(e) => setText(key, i, e.target.value)}
                  className="w-full resize-none rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 disabled:border-transparent disabled:bg-transparent" />
                <div className="mt-1 flex items-center gap-1">
                  {x.sources.length ? chips(x.sources) : <span className="text-xs text-slate-400">no source</span>}
                  {!ro && (
                    <button type="button" aria-label="Delete statement" onClick={() => setSoap({ ...soap, [key]: soap[key].filter((_, j) => j !== i) })}
                      className="ml-auto text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
                  )}
                </div>
              </div>
            ))}
            {!ro && (
              <button type="button" onClick={() => setSoap({ ...soap, [key]: [...soap[key], { text: "", sources: [] }] })}
                className="flex items-center gap-1 text-sm text-teal-700"><Plus size={14} /> Add statement</button>
            )}
          </section>
        ))}

        {p.initial.not_discussed.length > 0 && (
          <p className="text-xs text-slate-500"><strong>Not mentioned in the conversation:</strong> {p.initial.not_discussed.join(", ")}</p>
        )}

        <section className="space-y-2 border-t border-slate-100 pt-4">
          <h2 className="text-sm font-semibold text-slate-900">Suggested medication updates</h2>
          {meds.length === 0 ? (
            <p className="text-sm italic text-slate-400">None mentioned</p>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                {ro ? "Changes ticked at approval were applied to the medication list." : "Only ticked changes are applied to the medication list on approval."}
              </p>
              {meds.map((m, i) => (
                <label key={i} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2 text-sm text-slate-800">
                  <input type="checkbox" className="mt-1" disabled={ro}
                    checked={ro ? !!m.applied : ticked.has(i)}
                    onChange={(e) => { const n = new Set(ticked); if (e.target.checked) n.add(i); else n.delete(i); setTicked(n); }} />
                  <span className="flex-1">
                    <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-medium uppercase ${ACTION_STYLE[m.action]}`}>{m.action}</span>
                    <strong>{m.drug_name}</strong>
                    {(m.new_dose || m.new_frequency) && <span className="text-slate-600"> · {[m.new_dose, m.new_frequency].filter(Boolean).join(" ")}</span>}
                    {m.reason && <span className="block text-xs text-slate-500">Reason: {m.reason}</span>}
                    <span className="mt-1 flex gap-1">{chips(m.sources)}</span>
                  </span>
                </label>
              ))}
            </>
          )}
        </section>

        {!ro && (
          <div className="space-y-2 border-t border-slate-100 pt-4">
            {!p.isDoctor && <p className="text-xs text-amber-700">Only a doctor can approve. Ask a doctor to review this note.</p>}
            {msg && <p className="text-xs text-slate-600">{msg}</p>}
            <div className="flex flex-wrap gap-2">
              <button disabled={!p.isDoctor || pending} onClick={() => run(() => approveNote(p.noteId, content(), [...ticked]))}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40">
                Approve and save
              </button>
              <button disabled={pending} onClick={() => run(() => saveNoteDraft(p.noteId, content()), "Draft saved")}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Save draft</button>
              <button disabled={pending} onClick={() => confirm("Discard this draft note?") && run(() => discardNote(p.noteId))}
                className="ml-auto rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50">Discard</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
