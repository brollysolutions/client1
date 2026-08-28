"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Link2Off, Loader2, LockKeyhole } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { Button } from "@/components/ui/button";
import {
  acceptAgentInvite,
  getAgentInvite,
  type AgentInvitePreview,
} from "@/lib/agent-invites";
import {
  acceptStaffInvite,
  getStaffInvite,
  type StaffInvitePreview,
} from "@/lib/staff-invites";
import type { AuthResult } from "@/lib/auth";

type State = "loading" | "valid" | "invalid" | "done";

type InvitePasswordViewProps<Preview> = {
  token: string;
  loadPreview: (token: string) => Promise<AuthResult<Preview>>;
  acceptInvite: (
    token: string,
    password: string,
    confirmPassword: string,
  ) => Promise<AuthResult<unknown>>;
  accountDescription: (preview: Preview) => string;
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  sub_admin: "Sub Admin",
  telecaller: "Telecaller",
  employee: "Employee",
};

function InvitePasswordView<Preview extends { first_name: string | null }>({
  token,
  loadPreview,
  acceptInvite,
  accountDescription,
}: InvitePasswordViewProps<Preview>) {
  const [state, setState] = React.useState<State>("loading");
  const [preview, setPreview] = React.useState<Preview | null>(null);

  React.useEffect(() => {
    let active = true;
    void loadPreview(token).then((response) => {
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
  }, [loadPreview, token]);

  const panelTitle = state === "done" ? "Your account is ready." : "Secure your account.";
  const panelSubtitle =
    state === "invalid"
      ? "For security, expired, used, revoked, and unknown links all look the same."
      : "Choose a private password. Your invitation is consumed only after the password is accepted.";

  return (
    <AuthShell
      scene="register"
      panelTitle={panelTitle}
      panelSubtitle={panelSubtitle}
      steps={["Verify invitation", "Create password"]}
      activeStep={state === "loading" || state === "invalid" ? 0 : 1}
    >
      {state === "loading" ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-cta" aria-hidden="true" />
          <p className="text-sm text-text-secondary">Checking your invitation…</p>
        </div>
      ) : null}

      {state === "valid" && preview ? (
        <>
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-cta-tint text-brand-cta">
            <LockKeyhole className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="mb-5 space-y-2">
            <h1 className="font-heading text-3xl font-bold text-text-primary">
              Welcome{preview.first_name ? `, ${preview.first_name}` : ""}
            </h1>
            <p className="text-base leading-6 text-text-secondary">
              {accountDescription(preview)} This invitation works once and expires after seven
              days.
            </p>
          </div>

          <SetPasswordForm
            passwordLabel="Create your password"
            submitLabel="Set password"
            onSubmit={async (password, confirm) => {
              const response = await acceptInvite(token, password, confirm);
              if (response.ok) setState("done");
              return response;
            }}
          />
          <p className="mt-4 text-xs leading-5 text-text-secondary">
            Use 8–128 characters with uppercase, lowercase, a number, and a special character.
            The server also rejects commonly used passwords and passwords containing your mobile
            number without exposing that number on this page.
          </p>
        </>
      ) : null}

      {state === "done" || state === "invalid" ? (
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-cta-tint text-brand-cta">
            {state === "done" ? (
              <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
            ) : (
              <Link2Off className="h-7 w-7" aria-hidden="true" />
            )}
          </span>
          <h1 className="mt-5 font-heading text-3xl font-bold text-text-primary">
            {state === "done" ? "Your password is set" : "This link is no longer valid"}
          </h1>
          <p className="mt-3 text-base leading-6 text-text-secondary">
            {state === "done"
              ? "Sign in with your mobile number and the password you just chose."
              : "Ask your Admin for a new setup link. For security, we cannot show why this link stopped working."}
          </p>
          <Button asChild className="mt-6 w-full">
            <Link href="/login">Go to sign in</Link>
          </Button>
        </div>
      ) : null}
    </AuthShell>
  );
}

export function AgentInvitePasswordView({ token }: { token: string }) {
  return (
    <InvitePasswordView<AgentInvitePreview>
      token={token}
      loadPreview={getAgentInvite}
      acceptInvite={acceptAgentInvite}
      accountDescription={(preview) =>
        `Create a password for Agent account ${preview.agent_code}.`
      }
    />
  );
}

export function StaffInvitePasswordView({ token }: { token: string }) {
  return (
    <InvitePasswordView<StaffInvitePreview>
      token={token}
      loadPreview={getStaffInvite}
      acceptInvite={acceptStaffInvite}
      accountDescription={(preview) =>
        `Create a password for your ${ROLE_LABEL[preview.role] ?? preview.role.replaceAll("_", " ")} account.`
      }
    />
  );
}
