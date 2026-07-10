import Link from "next/link";
import { ChevronRight, HelpCircle, LayoutGrid, Sparkles } from "lucide-react";

import { LeadDialog } from "@/components/lead-dialog";
import { calculatorIcon } from "@/lib/calculators/icons";
import { getCalculator } from "@/lib/calculators/registry";
import type { CalculatorDef } from "@/lib/calculators/types";
import { CalculatorCard } from "./calculator-card";
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
  const HeroIcon = calculatorIcon(def.slug);

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
              <span className="inline-flex items-center gap-2 rounded-full bg-[var(--nav-tint)] px-3 py-1 font-geist text-xs font-semibold uppercase tracking-wide text-[var(--nav-primary)] ring-1 ring-inset ring-[var(--nav-primary)]/10">
                <HeroIcon className="h-3.5 w-3.5" aria-hidden />
                {def.eyebrow}
              </span>
              <h1 className="mt-4 max-w-3xl font-heading text-4xl font-semibold text-[var(--nav-text)] sm:text-5xl">
                {def.h1}
              </h1>
              <p className="mt-4 max-w-2xl text-lg text-[var(--nav-text)]">{def.intro}</p>
            </div>
            <CalculatorHeroArt group={def.group} src={def.heroArt} />
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
          <SectionHeading icon={Sparkles} title="How it's calculated" />
          <p className="mt-5 text-lg leading-relaxed text-[var(--nav-text)]">{def.howItWorks}</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="w-full border-t border-[var(--nav-border)] bg-surface">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
          <SectionHeading icon={HelpCircle} title="Frequently asked questions" />
          <div className="mt-6">
            <CalculatorFaq items={def.faq} />
          </div>
        </div>
      </section>

      {/* Related calculators */}
      {related.length > 0 ? (
        <section className="w-full border-t border-[var(--nav-border)] bg-[var(--nav-bg)]">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
            <SectionHeading icon={LayoutGrid} title="Related calculators" />
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
            />
          </div>
        </div>
      </section>
    </>
  );
}

// Section header with a tinted icon badge, matching the hub and card treatment.
function SectionHeading({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--nav-tint)] text-[var(--nav-primary)] ring-1 ring-inset ring-[var(--nav-primary)]/10"
      >
        <Icon className="h-5 w-5" />
      </span>
      <h2 className="font-heading text-2xl font-semibold text-[var(--nav-text)] sm:text-3xl">
        {title}
      </h2>
    </div>
  );
}
