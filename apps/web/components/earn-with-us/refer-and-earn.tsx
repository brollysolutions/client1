import Link from "next/link";

import { ReferFlowScene } from "@/components/earn-with-us/refer-flow-scene";
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
    text: "Sign in and grab the referral code sitting in your account.",
  },
  {
    n: "2",
    title: "Share it",
    text: "Send it to friends and family who need a loan or a property.",
  },
  {
    n: "3",
    title: "Get cashback",
    text: "When their loan or purchase closes, paid by Razorpay or cheque.",
  },
];

export function ReferAndEarn() {
  return (
    <section
      id="refer-and-earn"
      aria-labelledby="refer-and-earn-heading"
      className="relative w-full scroll-mt-16 border-t border-[var(--nav-border)] bg-[var(--nav-bg)]"
    >
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
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

        <ReferFlowScene steps={STEPS} />

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
