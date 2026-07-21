"use client";

import * as React from "react";
import { BadgeCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { EmailVerifyBanner } from "@/components/auth/email-verify-banner";
import { useAuth } from "@/components/auth/session-provider";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";
import { useMe } from "@/features/dashboard/me-provider";
import { updateProfile, type Me } from "@/lib/auth";

export default function SettingsPage() {
  const { session } = useAuth();
  const { me, status, error, errorStatus, retry, setMe } = useMe();
  const [emailJustVerified, setEmailJustVerified] = React.useState(false);
  const emailVerified = me?.emailVerified ?? session?.emailVerified ?? false;
  const showEmailBanner = !emailVerified && !emailJustVerified;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Profile</h1>
        <p className="text-sm text-text-secondary">Your account details and how we reach you.</p>
      </div>

      {showEmailBanner && <EmailVerifyBanner onVerified={() => setEmailJustVerified(true)} />}

      {status === "loading" ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : status === "error" ? (
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      ) : me ? (
        <ProfileForm
          key={`${me.firstName}|${me.lastName}|${me.email}`}
          firstName={me.firstName}
          lastName={me.lastName}
          email={me.email}
          mobile={me.mobile}
          emailVerified={emailVerified}
          onSaved={(next) => {
            setMe(next);
            if (next.email !== me.email) setEmailJustVerified(false);
          }}
        />
      ) : null}
    </div>
  );
}

function ProfileForm({
  firstName: initialFirst,
  lastName: initialLast,
  email: initialEmail,
  mobile,
  emailVerified,
  onSaved,
}: {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  emailVerified: boolean;
  onSaved: (next: Me) => void;
}) {
  const [firstName, setFirstName] = React.useState(initialFirst);
  const [lastName, setLastName] = React.useState(initialLast);
  const [email, setEmail] = React.useState(initialEmail);
  const [saving, setSaving] = React.useState(false);

  const emailChanged = email.trim().toLowerCase() !== initialEmail.toLowerCase();
  const dirty =
    firstName.trim() !== initialFirst || lastName.trim() !== initialLast || emailChanged;
  const canSave = dirty && firstName.trim() !== "" && lastName.trim() !== "" && !saving;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    const res = await updateProfile({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: emailChanged ? email.trim() : undefined,
    });
    setSaving(false);
    if (res.ok) {
      onSaved(res.data);
      toast.success("Profile updated.", {
        description: emailChanged
          ? "We saved your details. Please verify your new email address."
          : "Your details have been saved.",
      });
    } else {
      toast.error(res.error || "Couldn't save your changes.", {
        description: "Please check your details and try again.",
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-border bg-card p-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="first-name">First name</Label>
          <Input
            id="first-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            maxLength={100}
            autoComplete="given-name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="last-name">Last name</Label>
          <Input
            id="last-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            maxLength={100}
            autoComplete="family-name"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="email">Email</Label>
            {emailVerified && !emailChanged && (
              <Badge variant="secondary" className="gap-1 bg-success/10 text-success">
                <BadgeCheck className="h-3 w-3" />
                Verified
              </Badge>
            )}
          </div>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <p className="text-xs text-text-secondary">
            {emailChanged
              ? "You will need to verify this new address after saving."
              : "We use this for account notifications and recovery."}
          </p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="mobile">Mobile</Label>
          <Input id="mobile" value={mobile} readOnly disabled />
          <p className="text-xs text-text-secondary">
            Your mobile number is your account ID and cannot be changed here.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canSave}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-loans-accent px-5 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-loans-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-loans-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  );
}
