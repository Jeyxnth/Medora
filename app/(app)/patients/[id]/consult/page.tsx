import Link from "next/link";

export default async function ConsultPage(props: PageProps<"/patients/[id]/consult">) {
  const { id } = await props.params;
  return (
    <div>
      <Link href={`/patients/${id}`} className="text-sm text-teal-700 hover:underline">← Back to patient</Link>
      <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
        Consultation recording and AI SOAP notes will be built in Phase 4.
      </div>
    </div>
  );
}
