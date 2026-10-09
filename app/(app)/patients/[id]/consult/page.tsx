import Link from "next/link";
import ConsultForm from "@/components/ConsultForm";

export default async function ConsultPage(props: PageProps<"/patients/[id]/consult">) {
  const { id } = await props.params;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/patients/${id}`} className="text-sm text-brand-700 hover:underline">← Back to patient</Link>
      <div className="card p-5">
        <p className="eyebrow">Consultation</p>
        <h1 className="page-title">New consultation</h1>
        <p className="mb-4 mt-1 text-sm text-slate-500">Record, upload or paste the conversation. AI drafts a SOAP note; you review and approve it before anything is saved.</p>
        <ConsultForm patientId={id} />
      </div>
    </div>
  );
}
