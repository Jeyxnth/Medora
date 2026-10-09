import Link from "next/link";
import UploadForm from "@/components/UploadForm";

export default async function UploadPage(props: PageProps<"/patients/[id]/upload">) {
  const { id } = await props.params;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href={`/patients/${id}`} className="text-sm text-brand-700 hover:underline">← Back to patient</Link>
      <div className="card p-5">
        <p className="eyebrow">Documents</p>
        <h1 className="page-title">Upload report</h1>
        <p className="mb-4 mt-1 text-sm text-slate-500">Lab report or prescription (photo or scan). AI reads it; you review before anything is saved.</p>
        <UploadForm patientId={id} />
      </div>
    </div>
  );
}
