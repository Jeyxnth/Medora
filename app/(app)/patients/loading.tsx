export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-4 h-8 w-40 rounded bg-slate-200" />
      <div className="mb-4 h-10 rounded-xl bg-slate-200" />
      <div className="card divide-y divide-slate-100">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <div className="h-10 w-10 rounded-full bg-slate-200" />
            <div className="flex-1 space-y-2"><div className="h-4 w-40 rounded bg-slate-200" /><div className="h-3 w-56 rounded bg-slate-100" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
