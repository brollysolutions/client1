import { Skeleton } from "@/components/ui/skeleton";

// Route-level skeleton for /apply-as-agent, shaped like the real page (illustrated
// hero + single-column sectioned form with a progress bar) so the swap to content
// doesn't jump. Overrides the generic (public) group loading fallback.
// SiteHeader/SiteFooter persist via the (public) layout.
export default function ApplyAsAgentLoading() {
  return (
    <div aria-hidden>
      {/* Hero */}
      <section className="w-full bg-[var(--nav-bg)]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <Skeleton className="h-10 w-2/3 max-w-md sm:h-12" />
              <Skeleton className="mt-5 h-5 w-full max-w-2xl" />
              <Skeleton className="mt-2 h-5 w-5/6 max-w-xl" />
            </div>
            <div className="hidden shrink-0 items-center justify-center lg:flex lg:w-[460px]">
              <Skeleton className="h-[360px] w-full max-w-[460px] rounded-2xl" />
            </div>
          </div>
        </div>
      </section>

      {/* Application form. max-w-7xl outer band + a left-anchored max-w-2xl
          content column (no mx-auto) mirrors the real, un-centered layout;
          section headers have no icon-badge stand-in since the real headers
          are typography-only now, except KYC which keeps a small inline stub. */}
      <section className="w-full border-t border-[var(--nav-border)] bg-[var(--nav-bg)]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="max-w-2xl">
            <Skeleton className="h-8 w-1/2 max-w-xs" />
            <Skeleton className="mt-2 h-5 w-3/4 max-w-sm" />

            <div className="mt-8 grid gap-8">
              {/* progress bar */}
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>

              {/* business line */}
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-72 max-w-full" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Skeleton className="h-12 rounded-lg" />
                  <Skeleton className="h-12 rounded-lg" />
                </div>
              </div>

              {/* your details */}
              <div className="grid gap-4 border-t border-[var(--nav-border)] pt-8">
                <Skeleton className="h-5 w-28" />
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-12 rounded-lg" />
                  </div>
                  <div className="grid gap-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-12 rounded-lg" />
                  </div>
                </div>
              </div>

              {/* contact */}
              <div className="grid gap-4 border-t border-[var(--nav-border)] pt-8">
                <Skeleton className="h-5 w-20" />
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-12 rounded-lg" />
                  </div>
                  <div className="grid gap-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-12 rounded-lg" />
                  </div>
                </div>
              </div>

              {/* KYC documents, mirrors the real rounded-xl tinted container
                  so the loading-to-content swap doesn't shift box edges */}
              <div className="border-t border-[var(--nav-border)] pt-8">
                <div className="rounded-xl border border-[var(--nav-border)] bg-[var(--nav-tint)]/30 p-5 sm:p-6">
                  <div className="grid gap-1.5">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
                      <Skeleton className="h-5 w-36" />
                    </div>
                    <Skeleton className="h-4 w-56 max-w-full" />
                  </div>
                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="grid gap-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-12 rounded-lg" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <Skeleton className="h-12 w-full rounded-md" />
            </div>

            <div className="mt-10 grid gap-4 border-t border-[var(--nav-border)] pt-8">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
                  <Skeleton className="h-5 w-full max-w-sm" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
