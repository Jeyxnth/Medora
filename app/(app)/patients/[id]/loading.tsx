export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-4 w-24 rounded bg-slate-200" />
      <div className="card flex items-center gap-4 p-5">
        <div className="h-16 w-16 rounded-full bg-slate-200" />
        <div className="space-y-2"><div className="h-6 w-48 rounded bg-slate-200" /><div className="h-4 w-72 rounded bg-slate-100" /></div>
      </div>
      <div className="card h-24" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2"><div className="card h-64" /><div className="card h-48" /></div>
        <div className="card h-48" />
      </div>
    </div>
  );
}
