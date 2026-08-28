"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Link2Off, Loader2 } from "lucide-react";

import { SetPasswordForm } from "@/components/auth/set-password-form";
import { Button } from "@/components/ui/button";
import { acceptAgentInvite, getAgentInvite, type AgentInvitePreview } from "@/lib/agent-invites";

type State = "loading" | "valid" | "invalid" | "done";

export function AgentInviteView({ token }: { token: string }) {
  const [state, setState] = React.useState<State>("loading");
  const [preview, setPreview] = React.useState<AgentInvitePreview | null>(null);

  React.useEffect(() => {
    let active = true;
    void getAgentInvite(token).then((response) => {
      if (!active) return;
      if (response.ok) {
        setPreview(response.data);
        setState("valid");
      } else {
        setState("invalid");
      }
    });
    return () => {
      active = false;
    };
  }, [token]);

  if (state === "loading") {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-brand-cta" aria-label="Checking invitation" />
      </div>
    );
  }

  if (state === "valid") {
    return (
      <section className="mx-auto min-h-[55vh] max-w-md px-4 py-16 sm:px-6">
        <div className="rounded-3xl border border-border bg-card p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Welcome{preview?.first_name ? `, ${preview.first_name}` : ""}
          </h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Set a password for Agent account {preview?.agent_code ?? ""}. This link works once and
            then stops working.
          </p>
          <div className="mt-6">
            <SetPasswordForm
              passwordLabel="Create your password"
              submitLabel="Set password"
              onSubmit={async (password, confirm) => {
                const response = await acceptAgentInvite(token, password, confirm);
                if (response.ok) {
                  setState("done");
                  return { ok: true, data: undefined };
                }
                return { ok: false, error: response.error, status: response.status };
              }}
            />
          </div>
        </div>
      </section>
    );
  }

  const done = state === "done";
  return (
    <section className="mx-auto flex min-h-[55vh] max-w-2xl items-center px-4 py-16 sm:px-6">
      <div className="w-full rounded-3xl border border-border bg-card p-8 text-center sm:p-12">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-cta-tint text-brand-cta">
          {done ? (
            <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
          ) : (
            <Link2Off className="h-7 w-7" aria-hidden="true" />
          )}
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-text-primary">
          {done ? "Your password is set" : "This link is no longer valid"}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-text-secondary">
          {done
            ? "You can sign in with your mobile number and the password you just chose."
            : "Invite links work once and expire after seven days. Ask your Admin to send a new one."}
        </p>
        <Button asChild className="mt-6">
          <Link href="/login">Go to sign in</Link>
        </Button>
      </div>
    </section>
  );
}
