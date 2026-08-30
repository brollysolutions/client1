import { Send, Ticket, Wallet } from "lucide-react";
import Link from "next/link";

import { ReferFlowScene } from "@/components/earn-with-us/refer-flow-scene";
import { StepFlow, type FlowStep } from "@/components/step-flow";
import { Button } from "@/components/ui/button";

// Consumer earning track: any registered user, no agent application needed.
// Payout wording matches the agent track (Razorpay or cheque); the payment
// gateway is for payouts only, never loan principal or property purchase, per
// docs/architecture.
//
// Two renders of the same three steps, one live at a time:
//   below lg  the shared StepFlow, identical to the home "How it works" flow
//   lg+       the animated ReferFlowScene, unchanged
// One array feeds both. The icons echo the scene's own glyphs (paper plane,
// wallet) so the two branches stay recognisably the same story.
const STEPS: FlowStep[] = [
  {
    n: 1,
    title: "Get your code",
    copy: "Sign in and grab the referral code sitting in your account.",
    icon: Ticket,
  },
  {
    n: 2,
    title: "Share it",
    copy: "Send it to friends and family who need a loan or a property.",
    icon: Send,
  },
  {
    n: 3,
    title: "Get cashback",
    copy: "When their loan or purchase closes, paid by Razorpay or cheque.",
    icon: Wallet,
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
            No partner application needed. Any registered user can refer.
          </p>
        </div>

        {/* Below lg: stacked on phone, three across from md where the connector
            line can land on the node centres. */}
        <StepFlow
          steps={STEPS}
          className="lg:hidden"
          gridClassName="md:grid-cols-3 md:gap-8"
          connectorClassName="left-[16.6667%] right-[16.6667%] top-8 hidden md:block lg:hidden"
        />

        {/* lg+: the animated scene and its own step strip, untouched. The icons
            are stripped here on purpose: ReferFlowScene is a Client Component,
            and a LucideIcon is a function, which cannot cross the server/client
            boundary. TypeScript accepts the wider array (extra properties are
            fine structurally), so only the serializable fields go over. */}
        <div className="hidden lg:block">
          <ReferFlowScene
            steps={STEPS.map(({ n, title, copy }) => ({ n, title, copy }))}
          />
        </div>

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
