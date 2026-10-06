"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Loader2, Check, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const STEPS = ["Uploading", "Reading document", "Checking values"];
const MAX_EDGE = 1800;

async function resizeToJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not process image"))), "image/jpeg", 0.85));
}

export default function UploadForm({ patientId }: { patientId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const docId = useRef<string | null>(null); // set once uploaded, so a retry only re-runs extraction
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [step, setStep] = useState(-1); // -1 idle
  const [error, setError] = useState<string | null>(null);

  function pick(f: File | undefined) {
    if (!f) return;
    if (!["image/jpeg", "image/png"].includes(f.type)) return setError("Please choose a JPEG or PNG image.");
    setError(null);
    setFile(f);
    docId.current = null;
    setPreview(URL.createObjectURL(f));
  }

  async function submit() {
    if (!file) return;
    setError(null);
    setStep(0);
    try {
      if (!docId.current) {
        const supabase = createClient();
        const blob = await resizeToJpeg(file);
        const path = `${patientId}/${crypto.randomUUID()}.jpg`;
        const up = await supabase.storage.from("documents").upload(path, blob, { contentType: "image/jpeg" });
        if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
        const { data: doc, error: insErr } = await supabase
          .from("documents")
          .insert({ patient_id: patientId, doc_type: "pending", file_path: path, status: "draft" })
          .select("id")
          .single();
        if (insErr || !doc) throw new Error(`Could not save document: ${insErr?.message}`);
        docId.current = doc.id;
      }

      setStep(1);
      const t = setTimeout(() => setStep(2), 6000); // extraction is one call; advance the label while waiting
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: docId.current }),
      });
      clearTimeout(t);
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Extraction failed");
      setStep(2);
      router.push(`/patients/${patientId}/documents/${docId.current}`);
    } catch (e) {
      setError((e as Error).message);
      setStep(-1);
    }
  }

  const busy = step >= 0;

  if (busy) {
    return (
      <ol className="space-y-3 py-4">
        {STEPS.map((label, i) => (
          <li key={label} className={`flex items-center gap-3 text-sm ${i <= step ? "text-slate-900" : "text-slate-400"}`}>
            {i < step ? <Check size={18} className="text-teal-600" /> : i === step ? <Loader2 size={18} className="animate-spin text-teal-600" /> : <span className="h-[18px] w-[18px] rounded-full border border-slate-300" />}
            {label}
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="space-y-4">
      <div
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center ${drag ? "border-teal-500 bg-teal-50" : "border-slate-300 hover:bg-slate-50"}`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Preview" className="mx-auto max-h-80 rounded-lg" />
        ) : (
          <div className="py-6 text-slate-500">
            <UploadCloud className="mx-auto mb-2" size={32} />
            <p className="text-sm">Drag a file here, or click to choose / take a photo</p>
            <p className="text-xs text-slate-400">JPEG or PNG</p>
          </div>
        )}
        <input ref={input} onClick={(e) => e.stopPropagation()} type="file" accept="image/jpeg,image/png" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <input ref={camera} onClick={(e) => e.stopPropagation()} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>

      <button type="button" onClick={() => camera.current?.click()} className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 sm:hidden">
        Take a photo
      </button>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <button onClick={submit} disabled={!file} className="w-full rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40">
        {error && file ? "Retry" : "Upload and read"}
      </button>
    </div>
  );
}
