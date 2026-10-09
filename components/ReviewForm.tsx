"use client";
import { useState, useTransition } from "react";
import { ZoomIn, ZoomOut, Plus, Trash2, AlertTriangle } from "lucide-react";
import { isIllegible, type Extraction, type LabResult, type MedField, type Medication } from "@/lib/extract";
import { medFlags, validateLab, validateMed } from "@/lib/validate";
import { suggestDrugs } from "@/lib/drug-match";
import { checkSafety, type Allergy, type Med, type SafetyLab } from "@/lib/safety";
import SafetyAlerts from "@/components/SafetyAlerts";
import { approveDocument, discardDocument, saveDraft } from "@/app/(app)/patients/[id]/documents/[docId]/actions";

type LabRow = {
  key: string; test_name: string; value: string; value_text: string; unit: string;
  ref_low: string; ref_high: string; printed_flag: string | null; confidence: LabResult["confidence"]; ok: boolean;
};
type MedRow = {
  key: string; drug_name: string; dose: string; frequency: string; duration: string;
  confidence: Medication["confidence"]; ok: boolean;
  field_conf?: Medication["field_conf"]; src_idx?: number;
  orig: Record<MedField, string>; // the AI's reading
  flags0: MedField[]; // fields flagged on the AI's reading (low confidence or illegible)
  confirmed: Partial<Record<MedField, boolean>>;
};
const FIELD_LABEL: Record<MedField, string> = { drug_name: "Drug", dose: "Dose", frequency: "Frequency", duration: "Duration" };

const s = (v: unknown) => (v == null ? "" : String(v));
const num = (v: string) => (v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const newKey = () => crypto.randomUUID();

const toLab = (r: LabRow): LabResult => ({
  test_name: r.test_name.trim(),
  value: num(r.value),
  value_text: num(r.value) !== null && String(num(r.value)) === r.value_text ? r.value_text : r.value,
  unit: r.unit.trim() || null,
  ref_low: num(r.ref_low),
  ref_high: num(r.ref_high),
  printed_flag: r.printed_flag,
  confidence: r.confidence,
});
const toMed = (r: MedRow): Medication => ({
  drug_name: r.drug_name.trim(),
  dose: r.dose.trim() || null,
  frequency: r.frequency.trim() || null,
  duration: r.duration.trim() || null,
  confidence: r.confidence,
  field_conf: r.field_conf,
  src_idx: r.src_idx,
});

// A flagged field is resolved once the doctor edited it away from the AI's reading, or ticked confirm.
// An illegible field can only be resolved by editing it.
const unresolvedFields = (r: MedRow) =>
  r.flags0.filter((f) => isIllegible(r[f]) || (r[f].trim() === r.orig[f].trim() && !r.confirmed[f]));

const inputCls = "w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 disabled:border-transparent disabled:bg-transparent";
const FLAG_RING = { low: "ring-2 ring-amber-400 bg-amber-50", illegible: "ring-2 ring-red-400 bg-red-50" };
const FLAG_STYLE: Record<string, string> = { H: "text-red-600", L: "text-red-600", N: "text-slate-500" };

export default function ReviewForm(p: {
  docId: string; docType: string; approved: boolean; isDoctor: boolean; canDiscard: boolean; imageUrl: string | null;
  initial: Extraction; patientName: string; nameMismatch: boolean; patientId: string;
  safety: { allergies: Allergy[]; activeMeds: Med[]; labs: SafetyLab[] };
}) {
  const ro = p.approved;
  const [date, setDate] = useState(p.initial.document_date ?? "");
  const [prescriber, setPrescriber] = useState(p.initial.prescriber ?? "");
  const [labName, setLabName] = useState(p.initial.lab_name ?? "");
  const [labs, setLabs] = useState<LabRow[]>(() =>
    p.initial.lab_results.map((r) => ({
      key: newKey(), test_name: r.test_name, value: s(r.value), value_text: r.value_text, unit: s(r.unit),
      ref_low: s(r.ref_low), ref_high: s(r.ref_high), printed_flag: r.printed_flag, confidence: r.confidence, ok: false,
    })));
  const [meds, setMeds] = useState<MedRow[]>(() =>
    p.initial.medications.map((m) => {
      const v = { drug_name: s(m.drug_name), dose: s(m.dose), frequency: s(m.frequency), duration: s(m.duration) };
      return {
        key: newKey(), ...v, confidence: m.confidence, ok: false, field_conf: m.field_conf, src_idx: m.src_idx,
        orig: v, flags0: medFlags(m), confirmed: {},
      };
    }));
  const [dateOk, setDateOk] = useState(false);
  const [prescriberOk, setPrescriberOk] = useState(false);
  const [nameOk, setNameOk] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const [reviewedKey, setReviewedKey] = useState("");
  const [pending, start] = useTransition();

  const isLab = p.docType === "lab_report";
  const labV = labs.map((r) => validateLab(toLab(r)));
  const medV = meds.map((r) => validateMed(toMed(r)));
  // Safety check: current active meds plus the rows in the form; only alerts involving the new rows are shown.
  const existing = p.safety.activeMeds.length;
  const alerts = p.docType === "prescription" && !ro
    ? checkSafety({
        patientId: p.patientId, allergies: p.safety.allergies, labs: p.safety.labs,
        activeMeds: [...p.safety.activeMeds, ...meds.filter((m) => m.drug_name.trim()).map((m) => ({ drug_name: m.drug_name.trim(), dose: m.dose, frequency: m.frequency }))],
      }).filter((a) => a.medIndexes.some((i) => i >= existing))
    : [];
  const criticalKey = alerts.filter((a) => a.severity === "critical").map((a) => a.key).join("|");
  const rx = p.docType === "prescription";
  const dateFlag = rx && !ro && !!date && p.initial.date_confidence === "low" && date === (p.initial.document_date ?? "") && !dateOk;
  const prescriberFlag = rx && !ro && (isIllegible(prescriber) || (!!prescriber && p.initial.prescriber_confidence === "low" && prescriber === (p.initial.prescriber ?? "") && !prescriberOk));
  const unresolvedFlags = meds.reduce((n, r) => n + unresolvedFields(r).length, 0) + Number(dateFlag) + Number(prescriberFlag);
  const unresolved =
    labV.filter((v, i) => v.issues.length && !labs[i].ok).length +
    medV.filter((v, i) => v.issues.length && !meds[i].ok).length;

  const setLab = (k: string, patch: Partial<LabRow>) => setLabs(labs.map((r) => (r.key === k ? { ...r, ...patch } : r)));
  const setMed = (k: string, patch: Partial<MedRow>) => setMeds(meds.map((r) => (r.key === k ? { ...r, ...patch } : r)));

  const data = (): Extraction => ({
    ...p.initial,
    document_date: date || null,
    prescriber: prescriber || null,
    lab_name: labName || null,
    lab_results: labV,
    medications: medV,
  });

  const blocker =
    !p.isDoctor ? "Only a doctor can approve. Ask a doctor to review."
    : !date ? "Set the document date."
    : p.nameMismatch && !nameOk ? "Confirm the patient name."
    : criticalKey && reviewedKey !== criticalKey ? "Review the critical safety alerts and tick the confirmation."
    : unresolvedFlags ? `${unresolvedFlags} flagged field${unresolvedFlags > 1 ? "s" : ""} to edit or confirm (marked in red or amber).`
    : unresolved ? `${unresolved} flagged row${unresolved > 1 ? "s" : ""} to verify.`
    : null;

  const run = (fn: () => Promise<{ error?: string } | void>, done?: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r?.error ?? done ?? null);
    });

  const rowCls = (bad: boolean) => `rounded-lg border p-2 ${bad ? "border-amber-200 border-l-4 border-l-amber-500 bg-amber-50" : "border-slate-200"}`;
  const verify = (issues: string[], ok: boolean, set: (v: boolean) => void) =>
    issues.length > 0 && !ro && (
      <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-amber-800">
        <span>{issues.join("; ")}</span>
        <label className="flex items-center gap-1 font-medium">
          <input type="checkbox" checked={ok} onChange={(e) => set(e.target.checked)} /> I verified this
        </label>
      </div>
    );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-3">
        <div className="mb-2 flex justify-end gap-1">
          <button onClick={() => setZoom(Math.max(0.5, zoom - 0.25))} className="rounded border border-slate-300 p-1.5 hover:bg-slate-50" aria-label="Zoom out"><ZoomOut size={16} /></button>
          <button onClick={() => setZoom(Math.min(3, zoom + 0.25))} className="rounded border border-slate-300 p-1.5 hover:bg-slate-50" aria-label="Zoom in"><ZoomIn size={16} /></button>
        </div>
        <div className="max-h-[75vh] overflow-auto rounded-lg bg-slate-100">
          {p.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imageUrl} alt="Source document" style={{ width: `${zoom * 100}%`, maxWidth: "none" }} />
          ) : (
            <p className="p-6 text-sm text-slate-500">Image unavailable.</p>
          )}
        </div>
      </div>

      <div className="space-y-4 card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
            {isLab ? "Lab report" : p.docType === "prescription" ? "Prescription" : "Other document"}
          </span>
          {ro ? (
            <span className="badge badge-approved">Approved</span>
          ) : (
            <span className="badge badge-draft">Draft - needs review</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs text-slate-500">
          <label>Document date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={ro} className={`${inputCls} ${dateFlag ? FLAG_RING.low : ""}`} /></label>
          {isLab ? (
            <label>Lab name<input value={labName} onChange={(e) => setLabName(e.target.value)} disabled={ro} className={inputCls} /></label>
          ) : (
            <label>Prescriber<input value={prescriber} onChange={(e) => setPrescriber(e.target.value)} disabled={ro} className={`${inputCls} ${isIllegible(prescriber) ? FLAG_RING.illegible : prescriberFlag ? FLAG_RING.low : ""}`} /></label>
          )}
        </div>

        {(dateFlag || prescriberFlag) && (
          <div className="space-y-1 text-xs font-medium text-amber-900">
            {dateFlag && <label className="flex items-center gap-1.5"><input type="checkbox" checked={dateOk} onChange={(e) => setDateOk(e.target.checked)} /> The date was read with low confidence. I checked it against the image</label>}
            {prescriberFlag && (isIllegible(prescriber)
              ? <p className="text-red-800">The prescriber is illegible. Type the name, or clear the field.</p>
              : <label className="flex items-center gap-1.5"><input type="checkbox" checked={prescriberOk} onChange={(e) => setPrescriberOk(e.target.checked)} /> The prescriber was read with low confidence. I checked it against the image</label>)}
          </div>
        )}

        {p.nameMismatch && !ro && (
          <div className="alert-card alert-critical">
            <p className="flex items-center gap-1.5 font-medium"><AlertTriangle size={16} /> Name on document does not match this patient</p>
            <p className="mt-1 text-xs">Document: {p.initial.patient_name ?? "(none found)"} · Patient: {p.patientName}</p>
            <label className="mt-2 flex items-center gap-2 text-xs font-medium">
              <input type="checkbox" checked={nameOk} onChange={(e) => setNameOk(e.target.checked)} /> I confirm this document belongs to {p.patientName}
            </label>
          </div>
        )}

        {isLab && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-900">Lab results</h2>
            {labs.map((r, i) => {
              const v = labV[i];
              return (
                <div key={r.key} className={rowCls(v.issues.length > 0 && !ro)}>
                  <div className="grid grid-cols-[1fr_1fr_1fr] items-center gap-2 sm:grid-cols-[1fr_5rem_5rem_4rem_4rem_1.5rem_1.5rem]">
                    <input value={r.test_name} onChange={(e) => setLab(r.key, { test_name: e.target.value })} disabled={ro} placeholder="Test" className={`${inputCls} col-span-3 sm:col-span-1`} />
                    <input value={r.value} onChange={(e) => setLab(r.key, { value: e.target.value })} disabled={ro} placeholder="Value" className={inputCls} />
                    <input value={r.unit} onChange={(e) => setLab(r.key, { unit: e.target.value })} disabled={ro} placeholder="Unit" className={inputCls} />
                    <input value={r.ref_low} onChange={(e) => setLab(r.key, { ref_low: e.target.value })} disabled={ro} placeholder="Low" className={inputCls} />
                    <input value={r.ref_high} onChange={(e) => setLab(r.key, { ref_high: e.target.value })} disabled={ro} placeholder="High" className={inputCls} />
                    <span className={`text-center text-sm font-semibold ${FLAG_STYLE[v.flag ?? ""] ?? "text-slate-300"}`}>{v.flag ?? "-"}</span>
                    {!ro && (
                      <button onClick={() => setLabs(labs.filter((x) => x.key !== r.key))} className="text-slate-400 hover:text-red-600" aria-label="Delete row"><Trash2 size={15} /></button>
                    )}
                  </div>
                  {verify(v.issues, r.ok, (ok) => setLab(r.key, { ok }))}
                </div>
              );
            })}
            {!ro && (
              <button onClick={() => setLabs([...labs, { key: newKey(), test_name: "", value: "", value_text: "", unit: "", ref_low: "", ref_high: "", printed_flag: null, confidence: "high", ok: false }])} className="flex items-center gap-1 text-sm text-brand-700">
                <Plus size={14} /> Add row
              </button>
            )}
          </section>
        )}

        {p.docType === "prescription" && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-900">Medications</h2>
            {meds.map((r, i) => {
              const v = medV[i];
              const open = ro ? [] : unresolvedFields(r);
              const ring = (f: MedField) => (!open.includes(f) ? "" : isIllegible(r[f]) ? FLAG_RING.illegible : FLAG_RING.low);
              const suggestions = ro ? [] : suggestDrugs(r.drug_name, p.safety.activeMeds.map((m) => m.drug_name));
              return (
                <div key={r.key} className={rowCls((v.issues.length > 0 && !ro) || open.length > 0)}>
                  <div className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[1fr_5rem_1fr_5rem_1.5rem]">
                    <input value={r.drug_name} onChange={(e) => setMed(r.key, { drug_name: e.target.value })} disabled={ro} placeholder="Drug" className={`${inputCls} col-span-2 sm:col-span-1 ${ring("drug_name")}`} />
                    <input value={r.dose} onChange={(e) => setMed(r.key, { dose: e.target.value })} disabled={ro} placeholder="Dose" className={`${inputCls} ${ring("dose")}`} />
                    <input value={r.frequency} onChange={(e) => setMed(r.key, { frequency: e.target.value })} disabled={ro} placeholder="Frequency" className={`${inputCls} ${ring("frequency")}`} />
                    <input value={r.duration} onChange={(e) => setMed(r.key, { duration: e.target.value })} disabled={ro} placeholder="Duration" className={`${inputCls} ${ring("duration")}`} />
                    {!ro && (
                      <button onClick={() => setMeds(meds.filter((x) => x.key !== r.key))} className="text-slate-400 hover:text-red-600" aria-label="Delete row"><Trash2 size={15} /></button>
                    )}
                  </div>
                  {suggestions.length > 0 && (
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-700">
                      Did you mean
                      {suggestions.map((sg) => (
                        <button key={sg} onClick={() => setMed(r.key, { drug_name: sg })} className="rounded-full border border-brand-300 bg-brand-50 px-2 py-0.5 font-medium text-brand-800 hover:bg-brand-100">{sg}</button>
                      ))}
                      ?
                    </p>
                  )}
                  {open.map((f) => isIllegible(r[f]) ? (
                    <p key={f} className="mt-1 text-xs font-medium text-red-800">{FIELD_LABEL[f]} is illegible on the document. Type the correct value, or delete the row.</p>
                  ) : (
                    <label key={f} className="mt-1 flex items-center gap-1.5 text-xs font-medium text-amber-900">
                      <input type="checkbox" checked={!!r.confirmed[f]} onChange={(e) => setMed(r.key, { confirmed: { ...r.confirmed, [f]: e.target.checked } })} />
                      {FIELD_LABEL[f]} was read with low confidence. I checked &quot;{r[f]}&quot; against the image
                    </label>
                  ))}
                  {verify(v.issues, r.ok, (ok) => setMed(r.key, { ok }))}
                </div>
              );
            })}
            {!ro && (
              <button onClick={() => setMeds([...meds, { key: newKey(), drug_name: "", dose: "", frequency: "", duration: "", confidence: "high", ok: false, orig: { drug_name: "", dose: "", frequency: "", duration: "" }, flags0: [], confirmed: {} }])} className="flex items-center gap-1 text-sm text-brand-700">
                <Plus size={14} /> Add row
              </button>
            )}
          </section>
        )}

        {p.docType === "prescription" && !ro && (
          <section className="space-y-2 border-t border-slate-100 pt-4">
            <SafetyAlerts alerts={alerts} title="Safety check" emptyText="No safety alerts for these medications" />
            {criticalKey && (
              <label className="flex items-center gap-2 text-sm font-medium text-red-800">
                <input type="checkbox" checked={reviewedKey === criticalKey} onChange={(e) => setReviewedKey(e.target.checked ? criticalKey : "")} />
                I have reviewed these alerts
              </label>
            )}
          </section>
        )}

        {p.docType === "other" && (
          <p className="text-sm text-slate-500">Unrecognised document type. Nothing will be imported; discard it or keep it as a draft.</p>
        )}

        {!ro && (
          <div className="sticky bottom-0 z-10 -mx-5 -mb-5 space-y-2 rounded-b-2xl border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
            {blocker && <p className="text-xs text-amber-700">{blocker}</p>}
            {msg && <p className="text-xs text-slate-600">{msg}</p>}
            <div className="flex flex-wrap gap-2">
              <button disabled={!!blocker || pending} onClick={() => run(() => approveDocument(p.docId, data()))} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40">
                Approve and save
              </button>
              <button disabled={pending} onClick={() => run(() => saveDraft(p.docId, data()), "Draft saved")} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                Save draft
              </button>
              {p.canDiscard && (
                <button disabled={pending} onClick={() => confirm("Discard this document and its file?") && run(() => discardDocument(p.docId))} className="ml-auto rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50">
                  Discard
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
