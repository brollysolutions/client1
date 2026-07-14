import Image from "next/image";
import Link from "next/link";
import { Gift, Handshake } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LeadDialog } from "@/components/lead-dialog";

// Home "Earn with Us" teaser: two earning tracks, agent commission and user
// referral cashback, as a single split editorial band, content on the left, a
// Storyset illustration on the right (earn-with-us.svg, shared with the full
// /earn-with-us page; recolored to our blue/navy palette, ₹ swapped in for
// the $ glyph; credit in site-footer). Recruits agents for BOTH lines; agents
// are single-line, referral is open to any registered user. This is a short
// teaser that points at the full page for eligibility, how earning works, and
// the FAQ; a secondary "Apply as an agent" shortcut stays here for visitors
// who already decided. UI accents stay blue. No invented numbers.
export function PartnerCta() {
  return (
    <section
      id="partners"
      aria-labelledby="partners-heading"
      className="relative w-full overflow-hidden scroll-mt-16 border-t border-[var(--nav-border)] bg-[var(--nav-bg)]"
    >
      <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] lg:gap-16">
          {/* Content */}
          <div className="lg:order-1">
            <h2
              id="partners-heading"
              className="font-heading text-3xl font-semibold text-foreground sm:text-4xl lg:text-5xl"
            >
              Earn with us
            </h2>
            <p className="mt-4 max-w-md text-lg text-text-secondary sm:text-xl">
              There are two ways to earn here. Both are free to start.
            </p>

            <ul className="mt-6 max-w-md space-y-4">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--nav-tint)] text-brand-blue">
                  <Handshake className="h-5 w-5" aria-hidden />
                </span>
                <p className="text-base text-foreground sm:text-lg">
                  <span className="font-semibold">Become an agent.</span>{" "}
                  Bring us people who need a loan or a property. You earn
                  commission on every deal that closes.
                </p>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--nav-tint)] text-brand-blue">
                  <Gift className="h-5 w-5" aria-hidden />
                </span>
                <p className="text-base text-foreground sm:text-lg">
                  <span className="font-semibold">Refer and earn.</span>{" "}
                  Share your referral code. When a friend buys a property or
                  closes a loan, you get cashback.
                </p>
              </li>
            </ul>

            {/* CTA */}
            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
              <Button
                asChild
                className="w-full bg-[var(--nav-primary)] text-white hover:bg-[var(--nav-primary-hover)] sm:w-auto"
              >
                <Link href="/earn-with-us">See how earning works</Link>
              </Button>
              <LeadDialog
                businessLine="loans"
                triggerVariant="outline"
                triggerLabel="Apply as an agent"
                href="/apply-as-agent"
              />
            </div>
            <p className="mt-3 text-sm text-text-secondary">
              Free to join. We verify every agent before they go live.
            </p>
          </div>

          {/* Illustration (decorative + desktop-only, lg+). Transparent, sits
              directly on the cream section so it blends, no boxed panel. Large and
              centered in the right column, like the line-split band illustrations. */}
          <div className="hidden lg:order-2 lg:flex lg:items-center lg:justify-center">
            <Image
              src="/illustrations/earn-with-us.svg"
              alt=""
              width={500}
              height={500}
              sizes="560px"
              className="mx-auto h-auto w-full max-w-[560px]"
              priority={false}
              aria-hidden
            />
          </div>
        </div>
      </div>
    </section>
  );
}

