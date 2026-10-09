const TITLES = /^(dr|mr|mrs|ms|miss)\.?$/i;

export function initials(name: string | null | undefined) {
  const parts = (name ?? "").split(/\s+/).filter((p) => p && !TITLES.test(p));
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export default function Avatar({ name, size = "md" }: { name: string | null | undefined; size?: "sm" | "md" | "lg" }) {
  const dim = size === "lg" ? "h-16 w-16 text-xl" : size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800 ${dim}`}>
      {initials(name)}
    </span>
  );
}
