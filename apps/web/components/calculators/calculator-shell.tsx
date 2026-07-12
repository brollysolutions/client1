import Link from "next/link";
import { Calculator, ChevronRight, Home as HomeIcon } from "lucide-react";

import { LeadDialog } from "@/components/lead-dialog";
import { FaqDoodles } from "@/components/faq-doodles";
import { contactHref } from "@/lib/leads";
import { calculatorIcon } from "@/lib/calculators/icons";
import { getCalculator } from "@/lib/calculators/registry";
import type { CalculatorDef } from "@/lib/calculators/types";
import { CalculatorCard } from "./calculator-card";
import { CalculatorFaq } from "./calculator-faq";
import { CalculatorHeroArt } from "./calculator-hero-art";
import { HowItsCalculated } from "./how-its-calculated";

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
  const CurrentIcon = calculatorIcon(def.slug);

  return (
    <>
      {/* Hero */}
      <section className="relative w-full overflow-hidden bg-[var(--nav-bg)]">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <nav aria-label="Breadcrumb" className="text-base text-text-secondary">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link
                  href="/"
                  className="group flex items-center gap-1.5 hover:text-[var(--nav-primary)]"
                >
                  <HomeIcon
                    className="h-4 w-4 shrink-0 text-[var(--nav-text)] transition-colors group-hover:text-[var(--nav-primary)]"
                    aria-hidden
                  />
                  Home
                </Link>
              </li>
              <ChevronRight className="h-4 w-4" aria-hidden />
              <li>
                <Link
                  href="/calculators"
                  className="group flex items-center gap-1.5 hover:text-[var(--nav-primary)]"
                >
                  <Calculator
                    className="h-4 w-4 shrink-0 text-[var(--nav-text)] transition-colors group-hover:text-[var(--nav-primary)]"
                    aria-hidden
                  />
                  Calculators
                </Link>
              </li>
              <ChevronRight className="h-4 w-4" aria-hidden />
              <li
                className="flex items-center gap-1.5 text-[var(--nav-text)]"
                aria-current="page"
              >
                <CurrentIcon className="h-4 w-4 shrink-0" aria-hidden />
                {def.navLabel}
              </li>
            </ol>
          </nav>

          {/* lg:min-h keeps every calculator hero the same height: the art
              column drives the row height, and emi.svg is 3:2 (shorter) while
              the rest are 1:1, so without a floor the EMI band collapses. */}
          <div className="mt-6 grid items-center gap-8 lg:min-h-[460px] lg:grid-cols-[1fr_auto]">
            <div>
              <h1 className="font-heading text-4xl font-semibold text-[var(--nav-text)] sm:text-5xl">
                {def.h1}
              </h1>
              <p className="mt-4 max-w-2xl text-lg text-[var(--nav-text)]">{def.intro}</p>
            </div>
            <CalculatorHeroArt group={def.group} src={def.heroArt} />
          </div>
        </div>
      </section>

      {/* Calculator island + collapsed "how it's calculated" footnote */}
      <section className="w-full border-t border-[var(--nav-border)] bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          {children}
          <HowItsCalculated content={def.howItWorks} />
        </div>
      </section>

      {/* FAQ */}
      <section className="relative w-full overflow-hidden border-t border-[var(--nav-border)] bg-[var(--nav-bg)]">
        <FaqDoodles />
        <div className="relative mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
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
                <CalculatorCard key={item.slug} def={item} compact />
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
              href={contactHref({
                line: def.businessLine,
                product: def.navLabel,
              })}
            />
          </div>
        </div>
      </section>
    </>
  );
}
