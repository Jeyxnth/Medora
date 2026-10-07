import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { currentRole } from "@/lib/roles";
import { GROQ_WHISPER_MODEL } from "@/lib/config";
import { ageFromDob } from "@/lib/utils";
import { draftNote, splitTranscript, transcriptText } from "@/lib/scribe";

export const maxDuration = 60;

const MAX_AUDIO = 9 * 1024 * 1024;

type Seg = { id: number; start: number | null; end: number | null; text: string };

// Audio is sent to Groq and never stored.
async function transcribe(file: File, hint: string): Promise<Seg[]> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const res = (await groq.audio.transcriptions.create({
    file,
    model: GROQ_WHISPER_MODEL,
    response_format: "verbose_json",
    temperature: 0,
    ...(hint ? { prompt: hint } : {}),
  })) as unknown as { text?: string; segments?: { start: number; end: number; text: string }[] };
  const segs = (res.segments ?? []).filter((s) => s.text?.trim());
  if (segs.length) return segs.map((s, i) => ({ id: i + 1, start: s.start, end: s.end, text: s.text.trim() }));
  return splitTranscript(res.text ?? "");
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  if (!can(await currentRole(supabase), "record_consultation")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const patientId = String(form?.get("patientId") ?? "");
  const audio = form?.get("audio");
  const text = String(form?.get("transcriptText") ?? "").trim();
  if (!patientId) return NextResponse.json({ error: "patientId required" }, { status: 400 });
  if (!(audio instanceof File && audio.size) && !text) return NextResponse.json({ error: "Provide audio or a transcript" }, { status: 400 });
  if (audio instanceof File && audio.size > MAX_AUDIO) return NextResponse.json({ error: "Audio is over 9 MB" }, { status: 413 });

  const { data: patient } = await supabase.from("patients").select("*").eq("id", patientId).single();
  if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  const today = new Date().toISOString().slice(0, 10);
  const [meds, allergies] = await Promise.all([
    supabase.from("medications").select("drug_name, end_date").eq("patient_id", patientId),
    supabase.from("allergies").select("substance").eq("patient_id", patientId),
  ]);
  const activeMeds = (meds.data ?? []).filter((m) => !m.end_date || m.end_date > today).map((m) => m.drug_name as string);

  try {
    const segments =
      audio instanceof File && audio.size
        ? await transcribe(audio, [...activeMeds, ...(allergies.data ?? []).map((a) => a.substance)].filter(Boolean).join(", ").slice(0, 400))
        : splitTranscript(text);
    if (!segments.length) return NextResponse.json({ error: "No speech found in the recording." }, { status: 422 });

    const content = await draftNote({
      segments,
      patient: { name: patient.name, age: ageFromDob(patient.dob), sex: patient.sex },
      activeMeds,
    });

    const { data: note, error } = await supabase
      .from("clinical_notes")
      .insert({
        patient_id: patientId,
        note_type: "SOAP",
        status: "draft",
        transcript: transcriptText(content.segments),
        content,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await logAudit({ action: "create_note", entityType: "clinical_note", entityId: note.id, patientId });
    return NextResponse.json({ noteId: note.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Could not create the note" }, { status: 500 });
  }
}
