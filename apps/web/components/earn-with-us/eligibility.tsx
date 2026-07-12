import Image from "next/image";

// Requirements sit flat on the section's cream background, no card boxes.
// Each item is identified by a sourced Storyset illustration (recolored to
// the brand blue accent) rather than a lucide icon chip. Requirements only,
// no invented numbers or timelines.
type Requirement = { title: string; detail: string; illustration: string };

const REQUIREMENTS: Requirement[] = [
  {
    title: "KYC documents",
    detail:
      "A valid ID and address proof, plus a photo. This is how we verify who you are before you go live.",
    illustration: "/illustrations/earn/kyc-documents.svg",
  },
  {
    title: "Mobile number",
    detail:
      "One mobile number, verified by OTP. It is how we reach you and how your account is identified.",
    illustration: "/illustrations/earn/mobile-verification.svg",
  },
  {
    title: "Payout details",
    detail:
      "We pay commission through Razorpay or by cheque, so have your bank details or a cheque option ready.",
    illustration: "/illustrations/earn/payout-details.svg",
  },
  {
    title: "RERA agent code (real estate only)",
    detail:
      "If you are applying for the real estate line, a valid RERA agent code is part of your KYC.",
    illustration: "/illustrations/earn/rera-agent-code.svg",
  },
  {
    title: "No fixed experience required",
    detail:
      "You do not need prior experience as an agent or broker. Anyone who can bring us genuine leads can apply.",
    illustration: "/illustrations/earn/no-experience-required.svg",
  },
];

export function EarnEligibility() {
  return (
    <section
      id="eligibility"
      aria-labelledby="eligibility-heading"
      className="w-full scroll-mt-16 border-t border-[var(--nav-border)] bg-[var(--nav-bg)]"
    >
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="eligibility-heading"
            className="font-heading text-3xl font-semibold text-foreground sm:text-4xl"
          >
            What you need to apply as an agent
          </h2>
          <p className="mt-4 text-lg text-text-secondary">
            A short list. Nothing to pay, nothing hidden.
          </p>
        </div>

        <ul className="mt-12 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {REQUIREMENTS.map((item) => (
            <li key={item.title} className="flex flex-col items-center text-center">
              <Image
                src={item.illustration}
                alt=""
                width={140}
                height={140}
                className="h-24 w-24 sm:h-28 sm:w-28 lg:h-32 lg:w-32"
              />
              <h3 className="mt-5 font-heading text-base font-semibold text-foreground">
                {item.title}
              </h3>
              <p className="mt-1 max-w-xs text-sm leading-relaxed text-text-secondary">
                {item.detail}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
