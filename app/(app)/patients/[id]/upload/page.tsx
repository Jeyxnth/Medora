import Link from "next/link";

export default async function UploadPage(props: PageProps<"/patients/[id]/upload">) {
  const { id } = await props.params;
  return (
    <div>
      <Link href={`/patients/${id}`} className="text-sm text-teal-700 hover:underline">← Back to patient</Link>
      <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
        Report upload and AI extraction will be built in Phase 3.
      </div>
    </div>
  );
}
