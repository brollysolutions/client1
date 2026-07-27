"use client";

import * as React from "react";
import { Check, Copy, Gift, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildWaMeUrl } from "@/lib/referral-share";
import type { MyReferral } from "@/lib/referrals-api";

const INELIGIBLE_COPY: Record<string, string> = {
  agent: "Referrals are for clients. Your agent account earns through commission instead.",
  staff: "Referrals are for clients only.",
  no_client_profile: "Referrals are for clients only.",
};

export function ReferralCodeCard({ my }: { my: MyReferral }) {
  const [copied, setCopied] = React.useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the code is still selectable/readable below */
    }
  }

  if (!my.eligible || !my.code) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-text-secondary">
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
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-cta-tint text-brand-cta">
          <Gift className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Refer &amp; earn</h2>
          <p className="mt-0.5 text-sm text-text-secondary">
            Share your code. When someone you refer completes their first loan or property deal,
            you earn a bonus.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="rounded-xl border border-dashed border-border bg-muted px-4 py-2.5 font-mono text-lg font-semibold tracking-widest text-text-primary">
          {my.code}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void copyCode(my.code as string)}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" /> Copy code
            </>
          )}
        </Button>
        {waHref ? (
          <Button asChild size="sm" className="bg-[#25D366] text-white hover:bg-[#1ea952]">
            <a href={waHref} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="h-4 w-4" /> Share on WhatsApp
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
