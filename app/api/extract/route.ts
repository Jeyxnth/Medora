import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { currentRole } from "@/lib/roles";
import { extractDocument } from "@/lib/extract";
import { validateExtraction } from "@/lib/validate";

export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  if (!can(await currentRole(supabase), "upload")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const { documentId } = await req.json().catch(() => ({}));
  if (!documentId) return NextResponse.json({ error: "documentId required" }, { status: 400 });

  const { data: doc } = await supabase.from("documents").select("*").eq("id", documentId).single();
  if (!doc?.file_path) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const file = await supabase.storage.from("documents").download(doc.file_path);
  if (file.error) return NextResponse.json({ error: `Could not read file: ${file.error.message}` }, { status: 500 });

  try {
    const image = Buffer.from(await file.data.arrayBuffer());
    const result = validateExtraction(await extractDocument(image, file.data.type || "image/jpeg"));
    const { error } = await supabase
      .from("documents")
      .update({ extracted_json: result, doc_type: result.doc_type })
      .eq("id", documentId);
    if (error) throw new Error(error.message);
    await logAudit({ action: "extract", entityType: "document", entityId: documentId, patientId: doc.patient_id });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Extraction failed" }, { status: 500 });
  }
}
