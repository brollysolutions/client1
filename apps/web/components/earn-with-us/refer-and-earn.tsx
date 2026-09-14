import Link from "next/link";
import { ArrowRight, Copy, Gift, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = [
  { icon: Copy, title: "Get your personal code", text: "Eligible clients will find their referral code and invite link in Referrals." },
  { icon: Send, title: "Share with someone you know", text: "Copy the invite link or use WhatsApp to share it with a friend exploring a loan or property." },
  { icon: Gift, title: "Follow their progress", text: "Track conversion and eligible rewards in your workspace. Rewards follow the applicable completion and payout rules." },
];

export function ReferAndEarn() {
  return (
    <section id="refer-and-earn" aria-labelledby="refer-and-earn-heading" className="scroll-mt-20 border-t border-border bg-background">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:px-8">
        <div className="max-w-xl">
          <p className="mb-4 text-sm font-medium text-brand-link">For eligible clients</p>
          <h2 id="refer-and-earn-heading" className="font-heading text-3xl font-semibold tracking-tight text-brand-heading sm:text-4xl">A useful introduction.<br />A reward to look forward to.</h2>
          <p className="mt-5 text-base leading-7 text-text-secondary">Help someone find their next step with Dhanadhara. Your own referral workspace keeps the code, sharing options and reward progress together.</p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <Button asChild size="lg"><Link href="/login">Open my referrals<ArrowRight aria-hidden /></Link></Button>
            <Link href="/get-started" className="inline-flex min-h-11 items-center text-sm font-medium text-brand-link underline-offset-4 hover:underline">See how to get started</Link>
          </div>
          <p className="mt-5 text-sm leading-6 text-text-secondary">New here? <Link href="/register" className="font-medium text-brand-link underline underline-offset-4">Create your account</Link>. Agent commissions are managed separately.</p>
        </div>
        <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card px-6">
          {STEPS.map(({ icon: Icon, title, text }, index) => (
            <li key={title} className="flex gap-5 py-7">
              <Icon className="mt-1 size-6 shrink-0 text-brand-link" aria-hidden />
              <div><p className="text-xs font-medium tabular-nums text-text-secondary">STEP 0{index + 1}</p><h3 className="mt-2 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-text-secondary">{text}</p></div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
