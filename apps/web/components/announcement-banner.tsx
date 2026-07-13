"use client";

import * as React from "react";
import { TriangleAlertIcon, X } from "lucide-react";

// The announcement copy — icon + text as one unit — rendered twice inside the
// mobile/tablet marquee track so the icon scrolls with the message. `inline-flex`
// keeps the icon vertically aligned with the text; `whitespace-nowrap` keeps it on
// one line; the trailing padding creates the visible gap between marquee repeats.
// Both copies must be IDENTICAL flex items (same tag + classes) so they sit on the
// same vertical baseline — otherwise the visible copy appears to drift up/down as
// the track scrolls. The duplicate carries `aria-hidden` on its own root span.
function MessageContent({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <span
      aria-hidden={ariaHidden || undefined}
      className="inline-flex items-center gap-2 whitespace-nowrap pr-12 text-xs sm:text-sm"
    >
      <TriangleAlertIcon className="h-4 w-4 shrink-0" />
      <span>
        <span className="font-medium">We connect you with the right banks.</span>{" "}
        <span>We&apos;re the bridge between customers and lenders, not a bank ourselves.</span>
      </span>
    </span>
  );
}

// Thin info bar that sits ABOVE the sticky NavBar. On small and tablet screens
// the copy scrolls as a single-line right-to-left marquee (news ticker); at lg+
// it falls back to the static centered banner. The dismiss (X) stays fixed on the
// right and hides the banner for the current session (no persistence).
export function AnnouncementBanner() {
  const [dismissed, setDismissed] = React.useState(false);

  if (dismissed) return null;

  return (
    <div role="region" aria-label="Site announcement" className="bg-notice text-[var(--nav-text)]">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 sm:px-6 lg:px-8">
        {/* MOBILE + TABLET: single-line marquee (icon scrolls with text) — hidden at lg+ */}
        <div className="flex min-w-0 flex-1 items-center lg:hidden">
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <div className="announcement-track flex w-max items-center whitespace-nowrap">
              <MessageContent />
              <MessageContent ariaHidden />
            </div>
          </div>
        </div>

        {/* DESKTOP: static centered — hidden below lg */}
        <div className="hidden flex-1 items-center justify-center gap-2 lg:flex">
          <TriangleAlertIcon className="h-4 w-4 shrink-0" />
          <p className="text-center text-sm">
            <span className="font-medium">We connect you with the right banks.</span>{" "}
            <span>
              We&apos;re the bridge between customers and lenders, not a bank ourselves.
            </span>
          </p>
        </div>

        {/* Dismiss — fixed on the right, does not scroll with the marquee */}
        <button
          type="button"
          aria-label="Dismiss announcement"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-md p-1 text-[var(--nav-text)]/70 transition-colors hover:text-[var(--nav-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-text)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
