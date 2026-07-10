import Image from "next/image";
import Link from "next/link";

import { LeadDialog } from "@/components/lead-dialog";

// Earn with Us page hero. The page's only <h1> (see page.tsx). Mirrors
// partner-cta.tsx's copy/illustration split so the home teaser and the full
// page read as the same offer, and shares the same Storyset illustration
// (earn-with-us.svg; credit in site-footer). Two tracks from the first
// sentence: agent commission and referral cashback.
export function EarnHero() {
  return (
    <section className="w-full bg-[var(--nav-bg)]">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div>
            <h1 className="font-heading text-4xl font-semibold text-[var(--nav-text)] sm:text-5xl">
              Two ways to earn with us
            </h1>
            <p className="mt-4 max-w-xl text-lg text-[var(--nav-text)]">
              Become an agent and earn commission on the deals you bring. Or
              refer friends and earn cashback when their property purchase or
              loan goes through. Both are free.
            </p>
            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
              <LeadDialog
                businessLine="loans"
                lineSelectable
                origin="agent-application-page"
                triggerLabel="Apply to become an agent"
                title="Apply to become an agent"
                description="Tell us your details and pick a line. We'll verify your KYC and get you started."
                submitLabel="Submit application"
              />
              <Link
                href="#refer-and-earn"
                className="inline-flex h-10 w-full items-center justify-center rounded-md border border-[var(--nav-primary)] px-4 text-sm font-medium text-[var(--nav-primary)] transition hover:bg-[var(--nav-tint)] sm:w-auto"
              >
                Refer and earn
              </Link>
            </div>
          </div>

          <div className="hidden lg:flex lg:items-center lg:justify-center">
            <Image
              src="/illustrations/earn-with-us.svg"
              alt=""
              width={500}
              height={500}
              sizes="520px"
              className="mx-auto h-auto w-full max-w-[480px]"
              priority
              aria-hidden
            />
          </div>
        </div>
      </div>
    </section>
  );
}
