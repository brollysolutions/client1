import * as React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

// Every link opens separately so multi-step forms retain their local state.
export function AuthLegalLinks() {
  return (
    <nav aria-label="Account legal information" className="mt-8 border-t border-border pt-5 text-center text-xs text-text-secondary">
      <div className="flex flex-wrap items-center justify-center gap-x-2">
        <LegalLink href="/privacy">Privacy Policy</LegalLink>
        <span aria-hidden="true">·</span>
        <LegalLink href="/terms">Terms of Use</LegalLink>
      </div>
      <p className="mt-1">Legal pages open in a new tab.</p>
    </nav>
  );
}

function LegalLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-1 rounded-sm font-medium text-brand-navy underline underline-offset-4 hover:text-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2"
    >
      {children}
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
      <span className="sr-only"> (opens in a new tab)</span>
    </Link>
  );
}
