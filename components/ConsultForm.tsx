"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Square, Upload, ClipboardPaste, Loader2, Check, AlertCircle, RotateCcw } from "lucide-react";

const STEPS = ["Transcribing", "Writing note", "Checking"];
const MAX_SECONDS = 600;
const MAX_BYTES = 9 * 1024 * 1024;

type Mode = "record" | "upload" | "paste";
const TABS: { key: Mode; label: string; icon: typeof Mic }[] = [
  { key: "record", label: "Record", icon: Mic },
  { key: "upload", label: "Upload audio", icon: Upload },
  { key: "paste", label: "Paste transcript", icon: ClipboardPaste },
];

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function ConsultForm({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [consent, setConsent] = useState(false);
  const [mode, setMode] = useState<Mode>("record");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [captions, setCaptions] = useState("");
  const [captionsOn, setCaptionsOn] = useState(false);
  const [recorded, setRecorded] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [step, setStep] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  const recog = useRef<{ stop(): void } | null>(null);
  const stepTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const busy = step >= 0;
  const file = mode === "record" ? recorded : mode === "upload" ? uploaded : null;
  const ready = mode === "paste" ? text.trim().length > 0 : !!file;

  useEffect(() => () => {
    clearInterval(timer.current);
    stepTimers.current.forEach(clearTimeout);
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
    recog.current?.stop();
  }, []);

  function startCaptions() {
    // Live captions are cosmetic only: any failure is ignored.
    try {
      const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!SR) return;
      const r = new SR();
      r.lang = "en-IN";
      r.continuous = true;
      r.interimResults = true;
      let final = "";
      r.onresult = (e: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) final += t + " "; else interim += t;
        }
        setCaptions(final + interim);
      };
      r.onerror = () => {};
      r.onend = () => { if (recog.current === r) { try { r.start(); } catch {} } }; // browsers stop on silence
      r.start();
      recog.current = r;
      setCaptionsOn(true);
    } catch {}
  }

  async function startRecording() {
    setError(null);
    setRecorded(null);
    setCaptions("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32000 });
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const mime = rec.mimeType || "audio/webm";
        const ext = mime.includes("mp4") ? "m4a" : "webm";
        setRecorded(new File(chunks.current, `consult.${ext}`, { type: mime }));
      };
      rec.start(1000);
      recorder.current = rec;
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      startCaptions();
    } catch {
      setError("Could not access the microphone. Check browser permissions, or use Upload audio / Paste transcript.");
    }
  }

  function stopRecording() {
    clearInterval(timer.current);
    const r = recog.current;
    recog.current = null;
    try { r?.stop(); } catch {}
    if (recorder.current?.state !== "inactive") recorder.current?.stop();
    setRecording(false);
    setCaptionsOn(false);
  }

  useEffect(() => { if (recording && seconds >= MAX_SECONDS) stopRecording(); }, [recording, seconds]);

  function pickFile(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setUploaded(null);
      return setError(`That file is ${(f.size / 1048576).toFixed(1)} MB. The limit is 9 MB; trim the recording or paste a transcript instead.`);
    }
    setUploaded(f);
  }

  async function submit() {
    setError(null);
    const body = new FormData();
    body.set("patientId", patientId);
    if (mode === "paste") body.set("transcriptText", text);
    else if (file) {
      if (file.size > MAX_BYTES) return setError("Audio is over 9 MB.");
      body.set("audio", file);
    }
    const first = mode === "paste" ? 1 : 0;
    setStep(first);
    stepTimers.current = [
      setTimeout(() => setStep((s) => Math.max(s, 1)), first === 0 ? 7000 : 0),
      setTimeout(() => setStep((s) => Math.max(s, 2)), first === 0 ? 15000 : 8000),
    ];
    try {
      const res = await fetch("/api/consult", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      stepTimers.current.forEach(clearTimeout);
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setStep(3);
      router.push(`/patients/${patientId}/notes/${json.noteId}`);
    } catch (e) {
      stepTimers.current.forEach(clearTimeout);
      setStep(-1);
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-medium text-slate-900">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy || recording} />
        Patient has consented to AI-assisted note-taking
      </label>

      <fieldset disabled={!consent || busy} className={`space-y-4 ${!consent ? "opacity-50" : ""}`}>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" disabled={recording} onClick={() => { setMode(key); setError(null); }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium ${mode === key ? "bg-white text-teal-700 shadow-sm" : "text-slate-600"}`}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {mode === "record" && (
          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center gap-3">
              {!recording ? (
                <button type="button" onClick={startRecording} className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
                  <Mic size={16} /> {recorded ? "Record again" : "Start recording"}
                </button>
              ) : (
                <button type="button" onClick={stopRecording} className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
                  <Square size={16} /> Stop
                </button>
              )}
              {recording && (
                <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  <span className="h-3 w-3 animate-pulse rounded-full bg-red-600" />
                  {mmss(seconds)} <span className="font-normal text-slate-500">/ {mmss(MAX_SECONDS)}</span>
                </span>
              )}
              {!recording && recorded && <span className="text-sm text-slate-600">Recorded {mmss(seconds)} ({(recorded.size / 1024).toFixed(0)} KB)</span>}
            </div>
            {(captionsOn || captions) && (
              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Live captions (preview only)</p>
                {captions || <span className="italic text-slate-400">Listening...</span>}
              </div>
            )}
          </div>
        )}

        {mode === "upload" && (
          <div className="rounded-xl border border-slate-200 p-4">
            <input type="file" accept="audio/*" onChange={(e) => pickFile(e.target.files?.[0])} className="text-sm text-slate-900" />
            {uploaded && <p className="mt-2 text-sm text-slate-600">{uploaded.name} ({(uploaded.size / 1048576).toFixed(1)} MB)</p>}
            <p className="mt-2 text-xs text-slate-500">Audio files up to 9 MB. The audio is transcribed and not stored.</p>
          </div>
        )}

        {mode === "paste" && (
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10}
            placeholder={"Doctor: What brings you in today?\nPatient: I have had a cough for 3 days..."}
            className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400" />
        )}

        <button type="button" onClick={submit} disabled={!ready || recording}
          className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40">
          Create draft note
        </button>
      </fieldset>

      {busy && (
        <ol className="space-y-2 text-sm">
          {STEPS.map((label, i) => {
            if (mode === "paste" && i === 0) return null;
            const done = step > i;
            return (
              <li key={label} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${done ? "border-teal-200 bg-teal-50 text-teal-800" : step === i ? "border-teal-400 bg-white font-medium text-slate-900 shadow-sm" : "border-slate-200 text-slate-400"}`}>
                {done ? <Check size={16} className="text-teal-600" /> : step === i ? <Loader2 size={16} className="animate-spin text-teal-600" /> : <span className="h-4 w-4 rounded-full border border-slate-300" />}
                {label}
              </li>
            );
          })}
        </ol>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          {ready && (
            <button type="button" onClick={submit} className="flex items-center gap-1 font-medium underline"><RotateCcw size={14} /> Retry</button>
          )}
        </div>
      )}
    </div>
  );
}
