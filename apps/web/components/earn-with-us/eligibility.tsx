import {
  BadgeCheck,
  Banknote,
  Building2,
  Smartphone,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

// White cards on the page's cream sections, matching the icon-chip card
// pattern from why-choose-us.tsx / trust-strip.tsx. Requirements only, no
// invented numbers or timelines.
type Requirement = { title: string; detail: string; icon: LucideIcon };

const REQUIREMENTS: Requirement[] = [
  {
    title: "KYC documents",
    detail:
      "A valid ID and address proof, plus a photo. This is how we verify who you are before you go live.",
    icon: BadgeCheck,
  },
  {
    title: "Mobile number",
    detail:
      "One mobile number, verified by OTP. It is how we reach you and how your account is identified.",
    icon: Smartphone,
  },
  {
    title: "Payout details",
    detail:
      "We pay commission through Razorpay or by cheque, so have your bank details or a cheque option ready.",
    icon: Banknote,
  },
  {
    title: "RERA agent code (real estate only)",
    detail:
      "If you are applying for the real estate line, a valid RERA agent code is part of your KYC.",
    icon: Building2,
  },
  {
    title: "No fixed experience required",
    detail:
      "You do not need prior experience as an agent or broker. Anyone who can bring us genuine leads can apply.",
    icon: Sparkles,
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

        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {REQUIREMENTS.map((item) => (
            <li key={item.title}>
              <article className="flex h-full flex-col rounded-2xl border border-[var(--nav-border)] bg-surface p-6 shadow-sm">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--nav-tint)] text-brand-blue ring-1 ring-[var(--nav-border)]">
                  <item.icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-5 font-heading text-base font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                  {item.detail}
                </p>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
