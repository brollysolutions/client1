import Image from "next/image";

import { LeadDialog } from "@/components/lead-dialog";

// Earn with Us page hero. The page's only <h1> (see page.tsx). Mirrors
// partner-cta.tsx's copy/illustration split so the home teaser and the full
// page read as the same offer. Reuses the same Storyset illustration, no new
// asset needed.
export function EarnHero() {
  return (
    <section className="w-full bg-[var(--nav-bg)]">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div>
            <h1 className="font-heading text-4xl font-semibold text-[var(--nav-text)] sm:text-5xl">
              Become a loan or real estate agent and earn commission
            </h1>
            <p className="mt-4 max-w-xl text-lg text-[var(--nav-text)]">
              Bring people the right loan or the right home. Apply for free,
              we verify your KYC, and you start earning commission on the
              deals you bring us, for loans or for real estate.
            </p>
            <div className="mt-8">
              <LeadDialog
                businessLine="loans"
                lineSelectable
                origin="agent-application-page"
                triggerLabel="Apply to become an agent"
                title="Apply to become an agent"
                description="Tell us your details and pick a line. We'll verify your KYC and get you started."
                submitLabel="Submit application"
              />
            </div>
          </div>

          <div className="hidden lg:flex lg:items-center lg:justify-center">
            <Image
              src="/illustrations/agent-earning.svg"
              alt=""
              width={720}
              height={720}
              sizes="640px"
              className="mx-auto h-auto w-full max-w-[560px]"
              priority
              aria-hidden
            />
          </div>
        </div>
      </div>
    </section>
  );
}
