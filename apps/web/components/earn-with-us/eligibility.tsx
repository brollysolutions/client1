import Image from "next/image";

import { EligibilityCornerObjects } from "@/components/earn-with-us/earn-decor";

// Requirements to apply as an agent. Five cards sit in a single row on desktop
// (2 / 1 columns on smaller screens), each enriched like the loans "Explore
// our services" cards: a thin brand-blue top accent bar, a hand-coded
// illustration in a soft-tinted band, then a number, title and short detail.
// Illustrations use natural colors with a blue accent (docs/design/
// illustration-style.md). Requirements only, no invented numbers or timelines.
type Requirement = { title: string; detail: string; illustration: string };

const REQUIREMENTS: Requirement[] = [
  {
    title: "KYC documents",
    detail: "A valid ID, address proof, and a photo so we can verify you.",
    illustration: "/illustrations/eligibility/kyc-documents.svg",
  },
  {
    title: "Mobile number",
    detail: "One mobile number, verified by OTP. That is your account.",
    illustration: "/illustrations/eligibility/mobile-number.svg",
  },
  {
    title: "Payout details",
    detail: "Bank details ready. We pay commission by Razorpay or cheque.",
    illustration: "/illustrations/eligibility/payout-details.svg",
  },
  {
    title: "RERA agent code",
    detail: "For the real estate line only, a valid RERA agent code.",
    illustration: "/illustrations/eligibility/rera-code.svg",
  },
  {
    title: "Beginners welcome",
    detail: "No broker background required. Bring genuine leads and apply.",
    illustration: "/illustrations/eligibility/no-experience.svg",
  },
];

export function EarnEligibility() {
  return (
    <section
      id="eligibility"
      aria-labelledby="eligibility-heading"
      className="relative w-full scroll-mt-16 border-t border-[var(--nav-border)] bg-[var(--nav-bg)]"
    >
      <EligibilityCornerObjects />
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="eligibility-heading"
            className="font-heading text-3xl font-semibold text-foreground sm:text-4xl"
          >
            What you need to apply as a partner
          </h2>
          <p className="mt-4 text-lg text-text-secondary">
            A short list. Nothing to pay, nothing hidden.
          </p>
        </div>

        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {REQUIREMENTS.map((item) => (
            <li
              key={item.title}
              className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--nav-border)] bg-surface shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-md"
            >
              <span
                aria-hidden
                className="h-1 w-full bg-[var(--nav-primary)] transition-colors duration-200 group-hover:bg-[var(--nav-primary-hover)]"
              />
              <div className="relative aspect-[5/4] w-full bg-[var(--nav-tint)]/40">
                <Image
                  src={item.illustration}
                  alt=""
                  aria-hidden
                  fill
                  sizes="(min-width: 1024px) 260px, (min-width: 640px) 50vw, 100vw"
                  className="object-contain p-5"
                />
              </div>
              <div className="flex flex-1 flex-col p-6">
                <h3 className="font-heading text-lg font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                  {item.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
