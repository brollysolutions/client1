"use client";

import * as React from "react";
import { BadgeCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { EmailVerifyBanner } from "@/components/auth/email-verify-banner";
import { useAuth } from "@/components/auth/session-provider";
import {
  OptionalProfileFields,
  optionalProfilePayload,
  validateOptionalProfile,
  type OptionalProfileDraft,
} from "@/components/profile/optional-profile-fields";
import { DeleteAccountDialog } from "@/components/settings/delete-account-dialog";
import { Badge } from "@/components/ui/badge";
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";
import { useMe } from "@/features/dashboard/me-provider";
import { PushSubscriptionCard } from "@/features/push-notifications/push-subscription-card";
import { JourneyDetailsCard } from "@/features/settings/journey-details-card";
import { PersonalizationSettingsCard } from "@/features/settings/personalization-settings-card";
import { updateProfile, type Me } from "@/lib/auth";
import {
  apiIssuesToFieldErrors,
  emailError,
  focusFirstInvalidField,
  requiredTextError,
} from "@/lib/form-validation";

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
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const formRef = React.useRef<HTMLFormElement>(null);

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
  const canSave = dirty && !saving;

  function validate() {
    const next: Record<string, string> = {};
    const firstNameError = requiredTextError(firstName, "First name", 100);
    const lastNameError = requiredTextError(lastName, "Last name", 100);
    const nextEmailError = emailError(email);
    if (firstNameError) next.firstName = firstNameError;
    if (lastNameError) next.lastName = lastNameError;
    if (nextEmailError) next.email = nextEmailError;
    if (includePersonalDetails) Object.assign(next, validateOptionalProfile(optionalProfile));
    setFieldErrors(next);
    if (Object.keys(next).length > 0) {
      requestAnimationFrame(() => {
        if (formRef.current) focusFirstInvalidField(formRef.current);
      });
    }
    return Object.keys(next).length === 0;
  }

  function clearError(field: string) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || !validate()) return;
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
        setFieldErrors((current) => ({ ...current, [parsed.field]: parsed.error }));
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
      const serverErrors = apiIssuesToFieldErrors(res.issues, {
        first_name: "firstName",
        last_name: "lastName",
        email: "email",
        gender_self_description: "genderSelfDescription",
        income_amount_minor: "incomeAmountRupees",
        income_period: "incomePeriod",
        occupation: "occupation",
        location: "location",
      });
      if (Object.keys(serverErrors).length > 0) setFieldErrors(serverErrors);
      toast.error(res.error || "Couldn't save your changes.", {
        description: "Please check your details and try again.",
      });
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-6 rounded-xl border border-border bg-card p-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="first-name">First name<RequiredIndicator /></Label>
          <Input
            id="first-name"
            value={firstName}
            onChange={(e) => { setFirstName(e.target.value); clearError("firstName"); }}
            maxLength={100}
            autoComplete="given-name"
            aria-invalid={Boolean(fieldErrors.firstName)}
            aria-describedby={fieldErrors.firstName ? "first-name-error" : undefined}
          />
          <FieldError id="first-name-error">{fieldErrors.firstName}</FieldError>
        </div>
        <div className="space-y-2">
          <Label htmlFor="last-name">Last name<RequiredIndicator /></Label>
          <Input
            id="last-name"
            value={lastName}
            onChange={(e) => { setLastName(e.target.value); clearError("lastName"); }}
            maxLength={100}
            autoComplete="family-name"
            aria-invalid={Boolean(fieldErrors.lastName)}
            aria-describedby={fieldErrors.lastName ? "last-name-error" : undefined}
          />
          <FieldError id="last-name-error">{fieldErrors.lastName}</FieldError>
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
            onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
            autoComplete="email"
            maxLength={254}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
          />
          <FieldError id="email-error">{fieldErrors.email}</FieldError>
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
              onChange={(next) => { setOptionalProfile(next); setFieldErrors((current) => {
                const remaining = { ...current };
                for (const key of Object.keys(next)) delete remaining[key];
                return remaining;
              }); }}
              disabled={saving}
              errors={fieldErrors}
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
