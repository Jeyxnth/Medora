"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { checkSafety, normalizeDrug, type Allergy, type Med, type SafetyLab } from "@/lib/safety";
import SafetyAlerts from "@/components/SafetyAlerts";
import { SOAP_KEYS, type MedChange, type NoteContent, type SoapKey } from "@/lib/scribe";
import { approveNote, discardNote, saveNoteDraft } from "@/app/(app)/patients/[id]/notes/[noteId]/actions";

const ACTION_STYLE: Record<MedChange["action"], string> = {
  start: "bg-emerald-100 text-emerald-800",
  stop: "bg-red-100 text-red-800",
  change: "bg-sky-100 text-sky-800",
};

function AutoText({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (t: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea ref={ref} rows={1} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
      className="min-w-0 flex-1 resize-none overflow-hidden rounded border border-transparent bg-transparent px-1.5 py-1 text-sm leading-snug text-slate-900 hover:border-slate-200 focus:border-teal-500 focus:bg-white disabled:bg-transparent" />
  );
}

export default function NoteReview(p: {
  noteId: string; approved: boolean; isDoctor: boolean; canDiscard: boolean; initial: NoteContent; patientId: string;
  safety: { allergies: Allergy[]; activeMeds: Med[]; labs: SafetyLab[] };
}) {
  const ro = p.approved;
  const [soap, setSoap] = useState(p.initial.soap);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<SoapKey>>(new Set());
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [pending, start] = useTransition();
  const transcript = useRef<HTMLDivElement>(null);

  const lit = hover ?? picked;
  const meds = p.initial.med_changes;

  // Active meds with the ticked changes applied, so the doctor sees whether the plan resolves the alerts.
  let simulated: Med[] = [...p.safety.activeMeds];
  meds.forEach((c, i) => {
    if (!ticked.has(i)) return;
    const at = simulated.findIndex((m) => normalizeDrug(m.drug_name) === normalizeDrug(c.drug_name));
    const old = simulated[at];
    if (c.action !== "start" && at >= 0) simulated = simulated.filter((_, j) => j !== at);
    if (c.action !== "stop" && (c.action === "start" || at >= 0)) {
      simulated.push({ drug_name: old?.drug_name ?? c.drug_name, dose: c.new_dose ?? old?.dose, frequency: c.new_frequency ?? old?.frequency });
    }
  });
  const alerts = ro ? [] : checkSafety({ patientId: p.patientId, allergies: p.safety.allergies, labs: p.safety.labs, activeMeds: simulated });

  const content = (): NoteContent => ({
    ...p.initial,
    soap: Object.fromEntries(
      SOAP_KEYS.map(({ key }) => [key, soap[key].map((x) => ({ ...x, text: x.text.trim() })).filter((x) => x.text)]),
    ) as NoteContent["soap"],
  });

  const setText = (k: SoapKey, i: number, text: string) =>
    setSoap({ ...soap, [k]: soap[k].map((x, j) => (j === i ? { ...x, text } : x)) });

  const toggleSection = (k: SoapKey) => {
    const n = new Set(collapsed);
    if (n.has(k)) n.delete(k); else n.add(k);
    setCollapsed(n);
  };

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

  const critical = alerts.filter((a) => a.severity === "critical").length;
  const warnings = alerts.length - critical;
  const showSafety = critical > 0 || safetyOpen;
  const safetySummary = alerts.length === 0 ? "No safety alerts" : [critical && `${critical} critical`, warnings && `${warnings} warning`].filter(Boolean).join(", ");

  return (
    <div className="grid gap-3 lg:h-[calc(100vh-9rem)] lg:grid-cols-2 lg:grid-rows-1">
      <div className="card flex max-h-[60vh] min-h-0 flex-col p-4 lg:max-h-none">
        <h2 className="mb-2 shrink-0 text-sm font-semibold text-slate-900">Transcript</h2>
        <div ref={transcript} className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 text-sm leading-snug">
          {p.initial.segments.map((s) => (
            <div key={s.id} id={`seg-${s.id}`}
              className={`rounded-md border-l-4 px-2.5 py-1 transition-colors ${s.speaker === "doctor" ? "border-teal-500" : s.speaker === "patient" ? "border-slate-400" : "border-slate-200"} ${lit === s.id ? "bg-amber-100" : "bg-slate-50"}`}>
              <span className={`mr-1.5 text-xs font-semibold uppercase ${s.speaker === "doctor" ? "text-teal-700" : "text-slate-500"}`}>
                {s.speaker === "doctor" ? "Doctor" : s.speaker === "patient" ? "Patient" : "Other"} <span className="font-normal text-slate-400">[{s.id}]</span>
              </span>
              <span className="text-slate-800">{s.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card flex min-h-0 flex-col">
        <div className="min-h-0 flex-1 space-y-3 p-4 lg:overflow-y-auto">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">SOAP note</span>
            {ro ? (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">Approved</span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">Draft - needs review</span>
            )}
          </div>

          {SOAP_KEYS.map(({ key, label }) => (
            <section key={key} className="mb-3">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-1">
                <button type="button" onClick={() => toggleSection(key)} aria-expanded={!collapsed.has(key)}
                  className="flex items-center gap-1.5 rounded text-sm font-semibold text-slate-900">
                  {collapsed.has(key) ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                  {label}
                </button>
                <span className="rounded-full bg-slate-100 px-1.5 text-xs font-medium text-slate-600">{soap[key].length}</span>
                {!ro && (
                  <button type="button" onClick={() => setSoap({ ...soap, [key]: [...soap[key], { text: "", sources: [] }] })}
                    className="ml-auto flex items-center gap-0.5 text-xs font-medium text-teal-700 hover:underline"><Plus size={12} /> Add statement</button>
                )}
              </div>
              {!collapsed.has(key) && (
                soap[key].length === 0 ? (
                  <p className="py-1 text-sm italic text-slate-500">Not discussed</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {soap[key].map((x, i) => (
                      <div key={i} className="group flex items-start gap-2 py-0.5">
                        <AutoText value={x.text} disabled={ro} onChange={(t) => setText(key, i, t)} />
                        <div className="flex shrink-0 items-center gap-1 pt-1.5">
                          {x.sources.length ? chips(x.sources) : <span className="text-xs text-slate-400">no source</span>}
                          {!ro && (
                            <button type="button" aria-label="Delete statement" onClick={() => setSoap({ ...soap, [key]: soap[key].filter((_, j) => j !== i) })}
                              className="text-slate-400 opacity-0 hover:text-red-600 focus:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"><Trash2 size={14} /></button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </section>
          ))}

          {p.initial.not_discussed.length > 0 && (
            <p className="text-xs text-slate-500"><strong>Not mentioned in the conversation:</strong> {p.initial.not_discussed.join(", ")}</p>
          )}

          <section className="border-t border-slate-100 pt-3">
            <h2 className="text-sm font-semibold text-slate-900">Suggested medication updates</h2>
            {meds.length === 0 ? (
              <p className="py-1 text-sm italic text-slate-500">None mentioned</p>
            ) : (
              <>
                <p className="mb-1 text-xs text-slate-500">
                  {ro ? "Changes ticked at approval were applied to the medication list." : "Only ticked changes are applied to the medication list on approval."}
                </p>
                <div className="divide-y divide-slate-100">
                  {meds.map((m, i) => (
                    <label key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1 text-sm text-slate-800">
                      <input type="checkbox" disabled={ro}
                        checked={ro ? !!m.applied : ticked.has(i)}
                        onChange={(e) => { const n = new Set(ticked); if (e.target.checked) n.add(i); else n.delete(i); setTicked(n); }} />
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium uppercase ${ACTION_STYLE[m.action]}`}>{m.action}</span>
                      <strong>{m.drug_name}</strong>
                      {(m.new_dose || m.new_frequency) && <span className="text-slate-600">· {[m.new_dose, m.new_frequency].filter(Boolean).join(" ")}</span>}
                      {m.reason && <span className="text-xs text-slate-500">Reason: {m.reason}</span>}
                      <span className="ml-auto flex gap-1">{chips(m.sources)}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </section>

          {!ro && (
            <section className="border-t border-slate-100 pt-2">
              <button type="button" onClick={() => setSafetyOpen(!safetyOpen)} disabled={critical > 0} aria-expanded={showSafety}
                className="flex w-full items-center gap-1.5 text-sm font-semibold text-slate-900 disabled:cursor-default">
                {showSafety ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                Safety check
                <span className={`font-normal ${critical ? "text-red-700" : warnings ? "text-amber-700" : "text-emerald-700"}`}>· {safetySummary}</span>
              </button>
              {ticked.size > 0 && <p className="ml-5 text-xs text-slate-500">with ticked changes applied</p>}
              {showSafety && <div className="mt-2"><SafetyAlerts alerts={alerts} title="" /></div>}
            </section>
          )}
        </div>

        {!ro && (
          <div className="sticky bottom-0 z-10 shrink-0 space-y-1 rounded-b-2xl border-t border-slate-200 bg-white px-4 py-2">
            {!p.isDoctor && <p className="text-xs text-amber-700">Only a doctor can approve. Ask a doctor to review this note.</p>}
            {msg && <p className="text-xs text-slate-600">{msg}</p>}
            <div className="flex flex-wrap gap-2">
              <button disabled={!p.isDoctor || pending} onClick={() => run(() => approveNote(p.noteId, content(), [...ticked]))}
                className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40">
                Approve and save
              </button>
              <button disabled={pending} onClick={() => run(() => saveNoteDraft(p.noteId, content()), "Draft saved")}
                className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-50">Save draft</button>
              {p.canDiscard && (
                <button disabled={pending} onClick={() => confirm("Discard this draft note?") && run(() => discardNote(p.noteId))}
                  className="ml-auto rounded-lg border border-red-200 px-4 py-1.5 text-sm text-red-700 hover:bg-red-50">Discard</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
