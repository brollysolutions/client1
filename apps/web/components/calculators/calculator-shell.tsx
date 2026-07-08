import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { LeadDialog } from "@/components/lead-dialog";
import { getCalculator } from "@/lib/calculators/registry";
import type { CalculatorDef } from "@/lib/calculators/types";
import { CalculatorFaq } from "./calculator-faq";
import { CalculatorHeroArt } from "./calculator-hero-art";

// The server scaffold shared by every calculator page: hero (SEO copy) -> the
// interactive island -> "how it's calculated" -> FAQ -> related calculators ->
// lead CTA. Mirrors the section rhythm of product-page.tsx and stays blue-only.
// The island (a client component) is passed in as `children`.
export function CalculatorShell({
  def,
  children,
}: {
  def: CalculatorDef;
  children: React.ReactNode;
}) {
  const related = def.relatedSlugs
    .map((slug) => getCalculator(slug))
    .filter((c): c is CalculatorDef => Boolean(c));

  return (
    <>
      {/* Hero */}
      <section className="relative w-full overflow-hidden bg-[var(--nav-bg)]">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <nav aria-label="Breadcrumb" className="text-sm text-text-secondary">
            <ol className="flex flex-wrap items-center gap-1">
              <li>
                <Link href="/" className="hover:text-[var(--nav-primary)]">
                  Home
                </Link>
              </li>
              <ChevronRight className="h-4 w-4" aria-hidden />
              <li>
                <Link href="/calculators" className="hover:text-[var(--nav-primary)]">
                  Calculators
                </Link>
              </li>
              <ChevronRight className="h-4 w-4" aria-hidden />
              <li className="text-[var(--nav-text)]" aria-current="page">
                {def.navLabel}
              </li>
            </ol>
          </nav>

          <div className="mt-6 grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <p className="font-geist text-sm font-semibold uppercase tracking-wide text-brand-blue">
                {def.eyebrow}
              </p>
              <h1 className="mt-3 max-w-3xl font-heading text-4xl font-semibold text-[var(--nav-text)] sm:text-5xl">
                {def.h1}
              </h1>
              <p className="mt-4 max-w-2xl text-lg text-[var(--nav-text)]">{def.intro}</p>
            </div>
            <CalculatorHeroArt group={def.group} />
          </div>
        </div>
      </section>

      {/* Calculator island */}
      <section className="w-full border-t border-[var(--nav-border)] bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">{children}</div>
      </section>

      {/* How it's calculated */}
      <section className="w-full border-t border-[var(--nav-border)] bg-[var(--nav-bg)]">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
          <h2 className="font-heading text-2xl font-semibold text-[var(--nav-text)] sm:text-3xl">
            How it&apos;s calculated
          </h2>
          <p className="mt-4 text-lg text-[var(--nav-text)]">{def.howItWorks}</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="w-full border-t border-[var(--nav-border)] bg-surface">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
          <h2 className="font-heading text-2xl font-semibold text-[var(--nav-text)] sm:text-3xl">
            Frequently asked questions
          </h2>
          <div className="mt-6">
            <CalculatorFaq items={def.faq} />
          </div>
        </div>
      </section>

      {/* Related calculators */}
      {related.length > 0 ? (
        <section className="w-full border-t border-[var(--nav-border)] bg-[var(--nav-bg)]">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
            <h2 className="font-heading text-2xl font-semibold text-[var(--nav-text)] sm:text-3xl">
              Related calculators
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((item) => (
                <Link
                  key={item.slug}
                  href={`/calculators/${item.slug}`}
                  className="group flex h-full flex-col rounded-xl border border-[var(--nav-border)] bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  <h3 className="font-heading text-base font-semibold text-[var(--nav-text)] transition-colors group-hover:text-[var(--nav-primary)]">
                    {item.navLabel}
                  </h3>
                  <p className="mt-2 text-sm text-text-secondary">{item.cardSummary}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* Lead CTA */}
      <section className="w-full bg-[var(--nav-primary)]">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
          <h2 className="font-heading text-3xl font-semibold text-white sm:text-4xl">
            {def.leadCta.heading}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/85">{def.leadCta.text}</p>
          <div className="mt-8 flex justify-center">
            <LeadDialog
              businessLine={def.businessLine}
              origin={def.leadOrigin}
              triggerLabel={def.leadCta.triggerLabel}
              submitLabel={def.leadCta.submitLabel}
              description={def.leadCta.text}
              triggerVariant="invert"
            />
          </div>
        </div>
      </section>
    </>
  );
}
