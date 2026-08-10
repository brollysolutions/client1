"use client";

import * as React from "react";
import { Check, Copy, Gift } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildWaMeUrl } from "@/lib/referral-share";
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
  const origin = typeof window !== "undefined" ? window.location.origin : "";

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
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
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
            className="absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-text-secondary shadow-sm transition-colors hover:border-brand-cta hover:text-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          >
            {copied ? (
              <Check className="h-4 w-4 text-success" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        {waHref ? (
          <Button asChild className="h-auto min-h-12 bg-[#25D366] px-5 text-white hover:bg-[#1ea952]">
            <a href={waHref} target="_blank" rel="noopener noreferrer">
              <WhatsAppIcon className="h-5 w-5" /> Share on WhatsApp
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M16.04 3A12.9 12.9 0 0 0 5.02 22.62L3.1 29l6.53-1.87A12.98 12.98 0 1 0 16.04 3Zm0 23.75a10.72 10.72 0 0 1-5.47-1.5l-.39-.23-3.88 1.11 1.04-3.78-.25-.39a10.73 10.73 0 1 1 8.95 4.79Zm5.89-8.04c-.32-.16-1.91-.94-2.2-1.05-.3-.11-.51-.16-.73.16-.21.32-.83 1.05-1.02 1.27-.19.21-.38.24-.7.08-.32-.16-1.36-.5-2.59-1.6-.96-.85-1.6-1.9-1.79-2.22-.19-.32-.02-.5.14-.66.15-.14.32-.38.49-.57.16-.19.21-.32.32-.54.11-.21.05-.4-.03-.56-.08-.16-.73-1.75-1-2.4-.26-.63-.53-.55-.73-.56h-.62c-.22 0-.57.08-.87.4-.29.32-1.12 1.1-1.12 2.67 0 1.58 1.15 3.1 1.31 3.31.16.22 2.26 3.45 5.48 4.84.76.33 1.36.53 1.83.68.77.24 1.47.21 2.02.13.62-.09 1.91-.78 2.18-1.53.27-.75.27-1.39.19-1.53-.08-.13-.3-.21-.62-.37Z" />
    </svg>
  );
}
