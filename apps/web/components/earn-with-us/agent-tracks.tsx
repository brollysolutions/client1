import { Building2, Landmark } from "lucide-react";

// Static two-column layout, not shadcn Tabs: Radix Tabs.Content unmounts
// inactive panels by default, which would keep the real-estate/RERA copy out
// of the initial HTML. Both columns always render server-side so both keyword
// clusters (loan DSA, real estate referral agent) stay crawlable. Stacks on
// mobile.
export function EarnAgentTracks() {
  return (
    <section
      id="agent-tracks"
      aria-labelledby="agent-tracks-heading"
      className="w-full scroll-mt-16 border-t border-[var(--nav-border)] bg-[var(--nav-bg)]"
    >
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="agent-tracks-heading"
            className="font-heading text-3xl font-semibold text-foreground sm:text-4xl"
          >
            Two lines, pick one
          </h2>
          <p className="mt-4 text-lg text-text-secondary">
            An agent account works on one line only. Here is what each one
            looks like.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          <article className="rounded-2xl border border-[var(--nav-border)] bg-surface p-7 shadow-sm">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--nav-tint)] text-brand-blue ring-1 ring-[var(--nav-border)]">
              <Landmark className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="mt-5 font-heading text-xl font-semibold text-foreground">
              Loan agent
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              Bring us people looking for a personal, business, property,
              vehicle, or education loan. No RERA code needed, just valid KYC
              and genuine leads.
            </p>
          </article>

          <article className="rounded-2xl border border-[var(--nav-border)] bg-surface p-7 shadow-sm">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--nav-tint)] text-brand-blue ring-1 ring-[var(--nav-border)]">
              <Building2 className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="mt-5 font-heading text-xl font-semibold text-foreground">
              Real estate agent
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              Bring us property buyers or new listings. A valid RERA agent
              code is required as part of your KYC for this line.
            </p>
          </article>
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-text-secondary">
          Every agent account is single-line. If you already have a client
          account, you can apply to convert it to an agent account through the
          same KYC process.
        </p>
      </div>
    </section>
  );
}
