import { TriangleAlertIcon } from "lucide-react";

// Thin info bar that sits ABOVE the sticky NavBar.
// Dismiss (X) intentionally removed for development so the banner always
// shows while we're iterating on it. Add the dismiss button back before
// shipping to production.
export function AnnouncementBanner() {
  return (
    <div role="region" aria-label="Site announcement" className="bg-notice text-[var(--nav-text)]">
      <div className="mx-auto flex max-w-7xl items-start justify-center gap-2 px-4 py-2 sm:px-6 lg:px-8">
        <TriangleAlertIcon className="mt-0.5 h-4 w-4 shrink-0 sm:mt-[3px]" />
        <p className="text-center text-xs sm:text-sm">
          <span className="font-medium">We connect you with the right banks.</span>{" "}
          <span>We&apos;re the bridge between customers and lenders, not a bank ourselves.</span>
        </p>
      </div>
    </div>
  );
}
