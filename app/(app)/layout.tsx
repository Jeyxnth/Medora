import Header from "@/components/Header";

// Original flat cloud shape, white at about 60% opacity.
function Cloud({ className }: { className: string }) {
  return (
    <svg aria-hidden viewBox="0 0 200 80" className={`absolute ${className}`}>
      <g fill="#fff" fillOpacity="0.6">
        <circle cx="62" cy="48" r="24" />
        <circle cx="98" cy="34" r="31" />
        <circle cx="138" cy="46" r="25" />
        <rect x="38" y="46" width="124" height="28" rx="14" />
      </g>
    </svg>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate min-h-screen bg-[#EAF4FB]">
      {/* soft clouds in the upper area: behind all content, never clickable, hidden on narrow screens and in print */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 hidden h-72 overflow-hidden md:block print:hidden">
        <Cloud className="left-[3%] top-24 w-48" />
        <Cloud className="left-[44%] top-16 w-36" />
        <Cloud className="right-[4%] top-32 w-52" />
      </div>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
