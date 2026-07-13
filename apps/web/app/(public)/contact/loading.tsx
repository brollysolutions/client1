import { Skeleton } from "@/components/ui/skeleton";

// Route-level skeleton for /contact, shaped like the real page (hero +
// two-column message form / contact-info cards) so the swap to content doesn't
// jump. Overrides the generic (public) group loading fallback. SiteHeader/
// SiteFooter persist via the (public) layout.
export default function ContactLoading() {
  return (
    <div aria-hidden>
      {/* Hero */}
      <section className="w-full bg-[var(--nav-bg)]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <Skeleton className="h-10 w-1/2 max-w-sm sm:h-12" />
          <Skeleton className="mt-5 h-5 w-full max-w-2xl" />
          <Skeleton className="mt-2 h-5 w-5/6 max-w-xl" />
        </div>
      </section>

      {/* Form + contact details */}
      <section className="w-full border-t border-[var(--nav-border)] bg-[var(--nav-bg)]">
        <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 sm:pb-24 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
            {/* message form */}
            <div>
              <Skeleton className="h-8 w-1/2 max-w-xs" />
              <Skeleton className="mt-2 h-5 w-3/4 max-w-sm" />
              <div className="mt-6 grid gap-5 rounded-2xl border border-[var(--nav-border)] bg-surface p-6 shadow-sm sm:p-8">
                <div className="grid grid-cols-2 gap-2">
                  <Skeleton className="h-10 w-full rounded-md" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="grid gap-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-10 w-full rounded-md" />
                  </div>
                ))}
                <div className="grid gap-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-24 w-full rounded-md" />
                </div>
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            </div>

            {/* contact details */}
            <div>
              <Skeleton className="h-8 w-2/3 max-w-xs" />
              <Skeleton className="mt-2 h-5 w-full max-w-sm" />
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-4 rounded-2xl border border-[var(--nav-border)] bg-surface p-5 shadow-sm"
                  >
                    <Skeleton className="h-11 w-11 shrink-0 rounded-lg" />
                    <div className="w-full">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="mt-2 h-4 w-40" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
