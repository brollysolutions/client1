import type { TrustPoint } from "@/lib/products";

// Premium trust strip shown under a products grid (Loans) or standalone under
// a catalog section (Properties, "Properties for rent"). Reused across both
// public marketing pages, so it lives here rather than co-located inside
// product-page.tsx like the decorative doodle helpers. Server Component.

export function TrustStrip({
  eyebrow,
  points,
}: {
  eyebrow?: string;
  points: TrustPoint[];
}) {
  return (
    <div className="relative mt-14 overflow-hidden rounded-2xl border border-[var(--nav-border)] bg-[var(--nav-tint)]/40 shadow-md">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-brand-blue to-transparent"
      />
      <div className="px-6 py-9 sm:px-10">
        {eyebrow ? (
          <p className="text-center font-geist text-xs font-semibold uppercase tracking-[0.2em] text-brand-blue">
            {eyebrow}
          </p>
        ) : null}
        <div className="mt-7 grid gap-10 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-[var(--nav-border)]">
          {points.map((point) => (
            <div
              key={point.label}
              className="flex flex-col items-center px-6 text-center transition duration-200 hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-white to-[var(--nav-tint)] text-brand-blue shadow-sm ring-2 ring-brand-blue/20">
                <point.icon className="h-6 w-6" aria-hidden />
              </span>
              <h3 className="mt-4 font-heading text-base font-semibold text-foreground">
                {point.label}
              </h3>
              <p className="mt-1.5 max-w-[16rem] text-sm text-text-secondary">
                {point.note}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
