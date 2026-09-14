"use client";

import * as React from "react";
import { Check, Copy, Gift } from "lucide-react";

import { WhatsAppIcon } from "@/components/contact-actions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buildWaMeUrl, buildRegisterUrl } from "@/lib/referral-share";
import type { MyReferral } from "@/lib/referrals-api";
import { cn } from "@/lib/utils";

const INELIGIBLE_COPY: Record<string, string> = {
  agent: "Referrals are for clients. Your agent account earns through commission instead.",
  staff: "Referrals are for clients only.",
  no_client_profile: "Referrals are for clients only.",
};

export function ReferralCodeCard({ my }: { my: MyReferral }) {
  const [copied, setCopied] = React.useState(false);
  const copyResetTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => { setOrigin(window.location.origin); }, []);

  React.useEffect(
    () => () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    },
    [],
  );

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
      copyResetTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the code is still selectable/readable below */
    }
  }

  if (!my.eligible || !my.code) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-secondary">
            <Gift className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Refer &amp; earn</h2>
            <p className="mt-0.5 text-sm text-text-secondary">
              {INELIGIBLE_COPY[my.ineligible_reason ?? "no_client_profile"]}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const waHref = origin ? buildWaMeUrl(origin, my.code) : undefined;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-brand-link">
          <Gift className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Refer &amp; earn</h2>
          <p className="mt-0.5 text-sm text-text-secondary">
            Share your code. Track progress and eligible rewards when your referral completes a loan or property deal.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <div className="relative min-h-16 flex-1 overflow-hidden rounded-xl border border-dashed border-brand-cta/40 bg-brand-cta-tint/35 px-5 py-4 pr-14">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
            Your referral code
          </p>
          <code
            className={cn(
              "mt-1 block font-mono text-xl font-semibold tracking-[0.18em] text-text-primary transition-opacity",
              copied && "opacity-20",
            )}
          >
            {my.code}
          </code>
          {copied ? (
            <span
              aria-live="polite"
              className="absolute inset-0 flex items-center justify-center gap-1.5 font-medium text-success"
            >
              <Check className="h-5 w-5" aria-hidden="true" />
              Copied
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void copyCode(my.code as string)}
            aria-label={copied ? "Referral code copied" : "Copy referral code"}
            className="absolute right-2.5 top-2.5 grid h-11 w-11 place-items-center rounded-lg text-text-secondary transition-colors hover:border-brand-cta hover:text-brand-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {copied ? (
              <Check className="h-4 w-4 text-success" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        {origin && <Button variant="outline" className="h-auto min-h-12 px-5" onClick={() => { void navigator.clipboard.writeText(buildRegisterUrl(origin, my.code!)).then(() => toast.success("Referral link copied"), () => toast.error("Could not copy the link")); }}><Copy aria-hidden="true" />Copy invite link</Button>}
        {waHref ? (
          <Button asChild className="h-auto min-h-12 px-5">
            <a href={waHref} target="_blank" rel="noopener noreferrer">
              <WhatsAppIcon className="h-5 w-5" /> Share on WhatsApp
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
