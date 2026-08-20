"use client";

import * as React from "react";
import { BadgeCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { EmailVerifyBanner } from "@/components/auth/email-verify-banner";
import { useAuth } from "@/components/auth/session-provider";
import {
  OptionalProfileFields,
  optionalProfilePayload,
  type OptionalProfileDraft,
} from "@/components/profile/optional-profile-fields";
import { DeleteAccountDialog } from "@/components/settings/delete-account-dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";
import { useMe } from "@/features/dashboard/me-provider";
import { PushSubscriptionCard } from "@/features/push-notifications/push-subscription-card";
import { JourneyDetailsCard } from "@/features/settings/journey-details-card";
import { PersonalizationSettingsCard } from "@/features/settings/personalization-settings-card";
import { updateProfile, type Me } from "@/lib/auth";

export default function SettingsPage() {
  const { session } = useAuth();
  const { me, status, error, errorStatus, retry, setMe } = useMe();
  const [emailJustVerified, setEmailJustVerified] = React.useState(false);
  const emailVerified = me?.emailVerified ?? session?.emailVerified ?? false;
  const showEmailBanner = Boolean(me?.email) && !emailVerified && !emailJustVerified;
  const includePersonalDetails = session?.role === "client";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">
          {includePersonalDetails ? "Profile" : "Account settings"}
        </h1>
        <p className="text-sm text-text-secondary">
          {includePersonalDetails
            ? "Your account details and personal profile."
            : "Your account details and notification preferences."}
        </p>
      </div>

      {showEmailBanner && <EmailVerifyBanner onVerified={() => setEmailJustVerified(true)} />}

      {status === "loading" ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : status === "error" ? (
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      ) : me ? (
        <ProfileForm
          key={`${me.firstName}|${me.lastName}|${me.email}|${me.gender}|${me.incomeAmountMinor}|${me.occupation}|${me.location}`}
          firstName={me.firstName}
          lastName={me.lastName}
          email={me.email}
          mobile={me.mobile}
          emailVerified={emailVerified}
          gender={me.gender}
          genderSelfDescription={me.genderSelfDescription}
          incomeSource={me.incomeSource}
          incomeAmountMinor={me.incomeAmountMinor}
          incomePeriod={me.incomePeriod}
          occupation={me.occupation}
          location={me.location}
          includePersonalDetails={includePersonalDetails}
          onSaved={(next) => {
            setMe(next);
            if (next.email !== me.email) setEmailJustVerified(false);
          }}
        />
      ) : null}

      {session?.role === "client" ? <JourneyDetailsCard /> : null}

      <PushSubscriptionCard />

      {session?.role === "client" || session?.role === "agent" ? (
        <PersonalizationSettingsCard />
      ) : null}

      <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Danger zone</h2>
          <p className="text-sm text-text-secondary">
            Permanently delete your account and personal details.
          </p>
        </div>
        <DeleteAccountDialog />
      </div>
    </div>
  );
}

function ProfileForm({
  firstName: initialFirst,
  lastName: initialLast,
  email: initialEmail,
  mobile,
  emailVerified,
  gender: initialGender,
  genderSelfDescription: initialGenderSelfDescription,
  incomeSource: initialIncomeSource,
  incomeAmountMinor: initialIncomeAmountMinor,
  incomePeriod: initialIncomePeriod,
  occupation: initialOccupation,
  location: initialLocation,
  includePersonalDetails,
  onSaved,
}: {
  firstName: string;
  lastName: string;
  email: string | null;
  mobile: string;
  emailVerified: boolean;
  gender: Me["gender"];
  genderSelfDescription: Me["genderSelfDescription"];
  incomeSource: Me["incomeSource"];
  incomeAmountMinor: Me["incomeAmountMinor"];
  incomePeriod: Me["incomePeriod"];
  occupation: Me["occupation"];
  location: Me["location"];
  includePersonalDetails: boolean;
  onSaved: (next: Me) => void;
}) {
  const [firstName, setFirstName] = React.useState(initialFirst);
  const [lastName, setLastName] = React.useState(initialLast);
  const [email, setEmail] = React.useState(initialEmail ?? "");
  const [optionalProfile, setOptionalProfile] = React.useState<OptionalProfileDraft>({
    gender: initialGender ?? "",
    genderSelfDescription: initialGenderSelfDescription ?? "",
    incomeSource: initialIncomeSource ?? "",
    incomeAmountRupees:
      initialIncomeAmountMinor === null ? "" : String(initialIncomeAmountMinor / 100),
    incomePeriod: initialIncomePeriod ?? "",
    occupation: initialOccupation ?? "",
    location: initialLocation ?? "",
  });
  const [saving, setSaving] = React.useState(false);
  const [profileLocationPending, setProfileLocationPending] = React.useState(false);

  const emailChanged = email.trim().toLowerCase() !== (initialEmail ?? "").toLowerCase();
  const optionalChanged = includePersonalDetails && (
    optionalProfile.gender !== (initialGender ?? "") ||
    optionalProfile.genderSelfDescription.trim() !== (initialGenderSelfDescription ?? "") ||
    optionalProfile.incomeSource !== (initialIncomeSource ?? "") ||
    optionalProfile.incomeAmountRupees !==
      (initialIncomeAmountMinor === null ? "" : String(initialIncomeAmountMinor / 100)) ||
    optionalProfile.incomePeriod !== (initialIncomePeriod ?? "") ||
    optionalProfile.occupation.trim() !== (initialOccupation ?? "") ||
    optionalProfile.location.trim() !== (initialLocation ?? ""));
  const dirty =
    firstName.trim() !== initialFirst ||
    lastName.trim() !== initialLast ||
    emailChanged ||
    optionalChanged;
  const canSave =
    dirty &&
    firstName.trim() !== "" &&
    lastName.trim() !== "" &&
    !saving &&
    !profileLocationPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    const basePayload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: emailChanged ? email.trim().toLowerCase() || null : undefined,
    };
    let res;
    if (includePersonalDetails) {
      const parsed = optionalProfilePayload(optionalProfile);
      if (!parsed.ok) {
        setSaving(false);
        toast.error(parsed.error);
        return;
      }
      res = await updateProfile({ ...basePayload, ...parsed.data });
    } else {
      res = await updateProfile(basePayload);
    }
    setSaving(false);
    if (res.ok) {
      onSaved(res.data);
      toast.success("Profile updated.", {
        description: emailChanged
          ? email.trim()
            ? "We saved your details. Please verify your new email address."
            : "We saved your details and removed your email address."
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
            maxLength={254}
          />
          <p className="text-xs text-text-secondary">
            {emailChanged
              ? email.trim()
                ? "You will need to verify this new address after saving."
                : "Saving will remove your optional email address."
              : initialEmail
                ? "We use this for account notifications and recovery."
                : "Optional. Add an email if you want account recovery and updates."}
          </p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="mobile">Mobile</Label>
          <Input id="mobile" value={mobile} readOnly disabled />
          <p className="text-xs text-text-secondary">
            Your mobile number is your account ID and cannot be changed here.
          </p>
        </div>

        {includePersonalDetails ? (
          <div className="border-t border-border pt-5 sm:col-span-2">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-text-primary">Additional details</h2>
              <p className="text-xs text-text-secondary">
                These details are optional and can be removed at any time.
              </p>
            </div>
            <OptionalProfileFields
              idPrefix="settings-profile"
              value={optionalProfile}
              onChange={setOptionalProfile}
              disabled={saving}
              onLocationPendingChange={setProfileLocationPending}
            />
          </div>
        ) : null}
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
