import Link from "next/link";
import ConsultForm from "@/components/ConsultForm";

export default async function ConsultPage(props: PageProps<"/patients/[id]/consult">) {
  const { id } = await props.params;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/patients/${id}`} className="text-sm text-teal-700 hover:underline">← Back to patient</Link>
      <div className="card p-5">
        <h1 className="text-xl font-semibold text-slate-900">New consultation</h1>
        <p className="mb-4 mt-1 text-sm text-slate-500">Record, upload or paste the conversation. AI drafts a SOAP note; you review and approve it before anything is saved.</p>
        <ConsultForm patientId={id} />
      </div>
    </div>
  );
}
