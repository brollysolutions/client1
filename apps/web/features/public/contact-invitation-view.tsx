"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Link2Off, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getContactInvitation } from "@/lib/contact-invitations";

type State = "loading" | "valid" | "invalid";

export function ContactInvitationView({ token }: { token: string }) {
  const [state, setState] = React.useState<State>("loading");

  React.useEffect(() => {
    let active = true;
    void getContactInvitation(token).then((response) => {
      if (active) setState(response.ok && response.data.valid ? "valid" : "invalid");
    });
    return () => {
      active = false;
    };
  }, [token]);

  if (state === "loading") {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <Loader2
          className="h-7 w-7 animate-spin text-brand-blue"
          aria-label="Checking invitation"
        />
      </div>
    );
  }

  const valid = state === "valid";
  return (
    <section className="mx-auto flex min-h-[55vh] max-w-2xl items-center px-4 py-16 sm:px-6">
      <div className="w-full rounded-3xl border border-border bg-card p-8 text-center sm:p-12">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-cta-tint text-brand-cta">
          {valid ? (
            <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
          ) : (
            <Link2Off className="h-7 w-7" aria-hidden="true" />
          )}
        </span>
        <h1 className="mt-5 font-heading text-3xl font-semibold text-text-primary">
          {valid ? "You're invited to connect" : "This invitation is no longer active"}
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-text-secondary">
          {valid
            ? "Use the secure contact form to confirm your details. The invitation itself contains no contact information."
            : "It may have expired, been used, or been revoked. You can still contact our team normally."}
        </p>
        <Button asChild className="mt-7">
          <Link href={valid ? `/contact?invitation=${encodeURIComponent(token)}` : "/contact"}>
            Contact Dhanadhara
          </Link>
        </Button>
      </div>
    </section>
  );
}

