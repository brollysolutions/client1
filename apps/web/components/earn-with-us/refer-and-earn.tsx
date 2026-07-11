import Link from "next/link";

import { Button } from "@/components/ui/button";

// Consumer earning track: any registered user, no agent application needed.
// Same numbered-steps pattern as how-earning-works.tsx. Payout wording matches
// the agent track (Razorpay or cheque); the payment gateway is for payouts
// only, never loan principal or property purchase, per docs/architecture.
type Step = { n: string; title: string; text: string };

const STEPS: Step[] = [
  {
    n: "1",
    title: "Get your code",
    text: "Create an account or sign in. Your referral code lives in your account.",
  },
  {
    n: "2",
    title: "Share it",
    text: "Send your code to friends and family who need a loan or a property.",
  },
  {
    n: "3",
    title: "Get cashback",
    text: "When their property purchase completes or their loan is disbursed, your cashback is paid through Razorpay or by cheque.",
  },
];

export function ReferAndEarn() {
  return (
    <section
      id="refer-and-earn"
      aria-labelledby="refer-and-earn-heading"
      className="w-full scroll-mt-16 border-t border-[var(--nav-border)] bg-surface"
    >
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="refer-and-earn-heading"
            className="font-heading text-3xl font-semibold text-foreground sm:text-4xl"
          >
            Refer and earn cashback
          </h2>
          <p className="mt-4 text-lg text-text-secondary">
            No agent application needed. Any registered user can refer.
          </p>
        </div>

        <ol className="mx-auto mt-12 max-w-xl space-y-6">
          {STEPS.map((step) => (
            <li key={step.n} className="flex items-start gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--nav-primary)] font-heading text-sm font-semibold text-white shadow-sm">
                {step.n}
              </span>
              <div>
                <h3 className="font-heading text-base font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-0.5 text-sm leading-relaxed text-text-secondary">
                  {step.text}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mx-auto mt-10 flex max-w-xl flex-col items-center gap-3 text-center">
          <Button asChild className="w-full bg-[var(--nav-primary)] text-white hover:bg-[var(--nav-primary-hover)] sm:w-auto">
            <Link href="/login">Sign in to get your code</Link>
          </Button>
          <Link
            href="/register"
            className="text-sm text-text-secondary underline underline-offset-4 hover:text-foreground"
          >
            New here? Create a free account
          </Link>
        </div>
      </div>
    </section>
  );
}
