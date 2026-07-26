"use client";

import * as React from "react";
import {
  BadgeCheck,
  Camera,
  Check,
  CreditCard,
  IdCard,
  Loader2,
  type LucideIcon,
  Mail,
  ShieldCheck,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { MobileInput } from "@/components/auth/mobile-input";
import { OtpForm } from "@/components/auth/otp-form";
import { IconInput } from "@/components/icon-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  initiateAgentApplyOtp,
  resendAgentApplyOtp,
  submitAgentApplication,
  verifyAgentApplyOtp,
} from "@/lib/agent-application";
import type { LeadBusinessLine } from "@/lib/leads";
import { formatMobile, isValidMobile } from "@/lib/phone";
import { FileField } from "@/components/apply-as-agent/file-field";
import { FormProgress } from "@/components/apply-as-agent/form-progress";

// Public agent-application form for /apply-as-agent. Collects name, mobile,
// business_line, the KYC documents (Aadhaar front + back, PAN, photo; address
// proof was dropped by product decision, and PAN has no back side worth
// scanning), and rera_code for the real estate line. The mobile is OTP-verified
// before anything is written (POST /api/v1/agent-applications/*): submitting
// the details step only sends the OTP; the 4 files stay selected in memory
// until the code is confirmed, at which point the ticket it mints authorizes
// the uploads and the final submit. Blue-only, per the public-site palette.
const LINES: { value: LeadBusinessLine; label: string }[] = [
  { value: "loans", label: "Loans" },
  { value: "real_estate", label: "Real Estate" },
];

// Same idiom as app/(auth)/register/page.tsx: show the dev OTP hint in every
// non-production environment, never in prod.
const OTP_HINT_ALLOWED = process.env.NEXT_PUBLIC_ENV !== "production";

// Same idiom as app/(auth)/register/page.tsx: a 2+ letter TLD so half-typed
// addresses are rejected; names allow spaces/hyphens/apostrophes, no digits.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const NAME_RE = /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/;
// No authoritative RERA format in the repo: check it's alnum and a plausible
// length, and let the backend validate for real when that endpoint lands.
const RERA_RE = /^[A-Za-z0-9]{5,20}$/;

type FieldKey = "firstName" | "lastName" | "mobile" | "email" | "rera";
type Fields = Record<FieldKey, string>;
type FileKey = "aadhaarFront" | "aadhaarBack" | "pan" | "photo";

const EMPTY_FIELDS: Fields = {
  firstName: "",
  lastName: "",
  mobile: "",
  email: "",
  rera: "",
};

// Icon color is a rule, not a per-element choice: muted gray marks a static,
// decorative icon (the inline field-prefix icons below); brand blue marks
// something interactive or trust-earned (this header's own icon, the
// business-line toggle, file-upload buttons, progress, submit, success).
// Headings never get a boxed icon-badge, no matter how many sections there
// are, so a repeated icon-square doesn't become the section-divider pattern.
function SectionHeader({
  id,
  icon: Icon,
  title,
  description,
}: {
  id?: string;
  icon?: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="grid gap-0.5">
      <h3
        id={id}
        className="flex items-center gap-2 font-heading text-lg font-semibold text-foreground"
      >
        {Icon && (
          <Icon className="h-5 w-5 shrink-0 text-[var(--nav-primary)]" aria-hidden />
        )}
        {title}
      </h3>
      {description && (
        <p className="text-sm text-text-secondary">{description}</p>
      )}
    </div>
  );
}

export function AgentApplicationForm({
  defaultLine = "loans",
}: {
  defaultLine?: LeadBusinessLine;
}) {
  const [line, setLine] = React.useState<LeadBusinessLine>(defaultLine);
  const [fields, setFields] = React.useState<Fields>(EMPTY_FIELDS);
  const [errors, setErrors] = React.useState<Partial<Record<FieldKey, string>>>({});
  const [touched, setTouched] = React.useState<Partial<Record<FieldKey, boolean>>>({});

  const [aadhaarFront, setAadhaarFront] = React.useState<File | null>(null);
  const [aadhaarBack, setAadhaarBack] = React.useState<File | null>(null);
  const [pan, setPan] = React.useState<File | null>(null);
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [fileErrors, setFileErrors] = React.useState<Partial<Record<FileKey, string>>>({});
  // Honeypot: hidden from real users, so any non-empty value marks automation.
  const [company, setCompany] = React.useState("");

  const [step, setStep] = React.useState<"form" | "otp" | "uploading">("form");
  const [ticket, setTicket] = React.useState<string | null>(null);
  const [uploaded, setUploaded] = React.useState(0);
  const [uploadError, setUploadError] = React.useState<string | null>(null);

  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);

  // Single source of truth for a field's error, shared by the live (on-change)
  // check, the pre-submit check, and the progress meter, so none disagree.
  function fieldError(key: FieldKey, value: string): string | undefined {
    if (key === "firstName" || key === "lastName") {
      const person = key === "firstName" ? "first" : "last";
      const v = value.trim();
      if (!v) return `Enter your ${person} name.`;
      if (!NAME_RE.test(v)) return "Use letters only.";
      return undefined;
    }
    if (key === "email") {
      return EMAIL_RE.test(value.trim())
        ? undefined
        : "Enter a valid email address.";
    }
    if (key === "rera") {
      if (line !== "real_estate") return undefined;
      const v = value.trim().replace(/[\s/-]/g, "");
      if (!v) return "Enter your RERA agent code.";
      if (!RERA_RE.test(v)) return "Enter a valid RERA agent code.";
      return undefined;
    }
    return isValidMobile(value)
      ? undefined
      : "Enter a valid 10-digit mobile number.";
  }

  function validateField(key: FieldKey, value: string) {
    setErrors((e) => ({ ...e, [key]: fieldError(key, value) }));
  }

  function touchField(key: FieldKey) {
    setTouched((t) => ({ ...t, [key]: true }));
    validateField(key, fields[key]);
  }

  function set<K extends FieldKey>(key: K, value: Fields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
    if (touched[key]) validateField(key, value);
  }

  function validateFields(): boolean {
    const next: Partial<Record<FieldKey, string>> = {};
    (Object.keys(fields) as FieldKey[]).forEach((key) => {
      const msg = fieldError(key, fields[key]);
      if (msg) next[key] = msg;
    });
    setErrors(next);
    setTouched({
      firstName: true,
      lastName: true,
      mobile: true,
      email: true,
      rera: true,
    });
    return Object.keys(next).length === 0;
  }

  function validateFiles(): boolean {
    const next: Partial<Record<FileKey, string>> = {};
    if (!aadhaarFront) next.aadhaarFront = "Upload the front of your Aadhaar.";
    if (!aadhaarBack) next.aadhaarBack = "Upload the back of your Aadhaar.";
    if (!pan) next.pan = "Upload your PAN card.";
    if (!photo) next.photo = "Upload your photo.";
    setFileErrors(next);
    return Object.keys(next).length === 0;
  }

  // Derived on every render, never stored: the bar can never drift from the
  // fields it measures. Toggling to real_estate adds rera to both the
  // numerator and denominator, so the % drops honestly, then refills.
  const requiredFlags = [
    true, // business line always has a value
    !fieldError("firstName", fields.firstName),
    !fieldError("lastName", fields.lastName),
    !fieldError("mobile", fields.mobile),
    !fieldError("email", fields.email),
    aadhaarFront !== null,
    aadhaarBack !== null,
    pan !== null,
    photo !== null,
    ...(line === "real_estate" ? [!fieldError("rera", fields.rera)] : []),
  ];
  const progressPercent = Math.round(
    (requiredFlags.filter(Boolean).length / requiredFlags.length) * 100,
  );

  function resetForm() {
    setFields(EMPTY_FIELDS);
    setErrors({});
    setTouched({});
    setAadhaarFront(null);
    setAadhaarBack(null);
    setPan(null);
    setPhoto(null);
    setFileErrors({});
    setCompany("");
    setStep("form");
    setTicket(null);
    setUploaded(0);
    setUploadError(null);
  }

  // Details step: validate, then send the OTP. Nothing is written yet — the
  // 4 files stay selected in memory until the code is confirmed.
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const fieldsOk = validateFields();
    const filesOk = validateFiles();
    if (!fieldsOk || !filesOk || !aadhaarFront || !aadhaarBack || !pan || !photo)
      return;

    setSubmitting(true);
    const result = await initiateAgentApplyOtp(fields.mobile, company || undefined);
    setSubmitting(false);
    if (result.ok) {
      setStep("otp");
      if (result.data.otp_hint && OTP_HINT_ALLOWED) {
        toast.info("Dev verification code", { description: result.data.otp_hint });
      }
    } else {
      toast.error(result.error || "Couldn't send the verification code. Please try again.");
    }
  }

  // OTP step succeeded: the ticket is minted, now upload the 4 documents and
  // submit. Runs on its own screen (not inside OtpForm) so an upload failure
  // never reads as "wrong code" — the ticket stays valid for a retry.
  async function runUploadAndSubmit(applicationTicket: string) {
    if (!aadhaarFront || !aadhaarBack || !pan || !photo) return;
    setUploadError(null);
    setUploaded(0);
    const result = await submitAgentApplication(
      {
        ticket: applicationTicket,
        firstName: fields.firstName.trim(),
        lastName: fields.lastName.trim(),
        email: fields.email.trim(),
        businessLine: line,
        rera: line === "real_estate" ? fields.rera.trim() : undefined,
        aadhaarFront,
        aadhaarBack,
        pan,
        photo,
        company: company || undefined,
      },
      (done) => setUploaded(done),
    );

    if (result.ok) {
      resetForm();
      setDone(true);
      toast.success("Application received. We'll be in touch shortly.");
    } else {
      setUploadError(result.error || "Something went wrong. Please try again.");
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--nav-tint)] text-[var(--nav-primary)]">
          <Check className="h-7 w-7" aria-hidden />
        </span>
        <h3 className="font-heading text-xl font-semibold text-foreground">
          Application received
        </h3>
        <p className="max-w-sm text-text-secondary">
          Thanks for applying. We&apos;ll verify your KYC and get you started.
          Our team will call you back shortly.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => setDone(false)}
          className="border-[var(--nav-primary)] text-[var(--nav-primary)] hover:bg-[var(--nav-tint)] hover:text-[var(--nav-primary-hover)]"
        >
          Submit another application
        </Button>
      </div>
    );
  }

  if (step === "otp") {
    return (
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h3 className="font-heading text-xl font-semibold text-foreground">
            Confirm your number
          </h3>
          <p className="text-sm text-text-secondary">
            We sent a code to {formatMobile(fields.mobile)}. Enter it below to
            verify your application.
          </p>
        </div>
        <OtpForm
          submitLabel="Verify and submit"
          onSubmit={async (otp) => {
            const result = await verifyAgentApplyOtp(fields.mobile, otp);
            if (result.ok) {
              setTicket(result.data.application_ticket);
              setStep("uploading");
              void runUploadAndSubmit(result.data.application_ticket);
            }
            return result;
          }}
          onResend={async () => {
            const result = await resendAgentApplyOtp(fields.mobile);
            if (result.ok && result.data.otp_hint && OTP_HINT_ALLOWED) {
              toast.info("Dev verification code", { description: result.data.otp_hint });
            }
            return result;
          }}
        />
        <button
          type="button"
          onClick={() => setStep("form")}
          className="cursor-pointer text-center text-sm font-medium text-[var(--nav-primary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline"
        >
          Change number
        </button>
      </div>
    );
  }

  if (step === "uploading") {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        {uploadError ? (
          <>
            <p className="max-w-sm text-destructive">{uploadError}</p>
            <div className="flex gap-3">
              <Button
                type="button"
                onClick={() => ticket && void runUploadAndSubmit(ticket)}
                className="bg-[var(--nav-primary)] text-white hover:bg-[var(--nav-primary-hover)]"
              >
                Try again
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>
                Start over
              </Button>
            </div>
          </>
        ) : (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-[var(--nav-primary)]" aria-hidden />
            <p className="text-text-secondary">
              {uploaded > 0
                ? `Uploading document ${uploaded} of 4...`
                : "Submitting your application..."}
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-8">
      <FormProgress value={progressPercent} />

      {/* Honeypot: off-screen, out of the tab order, invisible to AT. */}
      <div aria-hidden className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="apply-company">Company</label>
        <input
          id="apply-company"
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
        />
      </div>

      {/* Business line */}
      <fieldset className="grid min-w-0 gap-4 border-0 p-0">
        <SectionHeader
          id="apply-line-heading"
          title="Which line?"
          description="Partner accounts work one line. Pick the one you want."
        />
        <div
          role="group"
          aria-labelledby="apply-line-heading"
          className="grid grid-cols-2 gap-2"
        >
          {LINES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={line === option.value}
              onClick={() => setLine(option.value)}
              disabled={submitting}
              className={cn(
                "h-12 cursor-pointer rounded-lg border px-3 text-sm font-medium transition",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--nav-primary)]/50",
                "disabled:cursor-default disabled:opacity-50",
                line === option.value
                  ? "border-[var(--nav-primary)] bg-[var(--nav-primary)] text-white"
                  : "border-[var(--nav-border)] bg-transparent text-foreground hover:bg-[var(--nav-tint)]",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Your details */}
      <fieldset className="grid min-w-0 gap-4 border-0 border-t border-[var(--nav-border)] p-0 pt-8">
        <SectionHeader title="Your details" />
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="apply-first-name">First name</Label>
            <IconInput
              id="apply-first-name"
              icon={User}
              value={fields.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              onBlur={() => touchField("firstName")}
              autoComplete="given-name"
              placeholder="Jane"
              aria-invalid={!!errors.firstName}
              aria-describedby={errors.firstName ? "apply-first-name-error" : undefined}
              disabled={submitting}
            />
            {errors.firstName && (
              <p id="apply-first-name-error" className="text-sm text-destructive">
                {errors.firstName}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="apply-last-name">Last name</Label>
            <IconInput
              id="apply-last-name"
              icon={User}
              value={fields.lastName}
              onChange={(e) => set("lastName", e.target.value)}
              onBlur={() => touchField("lastName")}
              autoComplete="family-name"
              placeholder="Doe"
              aria-invalid={!!errors.lastName}
              aria-describedby={errors.lastName ? "apply-last-name-error" : undefined}
              disabled={submitting}
            />
            {errors.lastName && (
              <p id="apply-last-name-error" className="text-sm text-destructive">
                {errors.lastName}
              </p>
            )}
          </div>
        </div>
      </fieldset>

      {/* Contact */}
      <fieldset className="grid min-w-0 gap-4 border-0 border-t border-[var(--nav-border)] p-0 pt-8">
        <SectionHeader title="Contact" />
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="apply-mobile">Phone number</Label>
            <MobileInput
              id="apply-mobile"
              value={fields.mobile}
              onChange={(e) => set("mobile", e.target.value)}
              onBlur={() => touchField("mobile")}
              autoComplete="tel"
              placeholder="98765 43210"
              aria-invalid={!!errors.mobile}
              aria-describedby={errors.mobile ? "apply-mobile-error" : undefined}
              disabled={submitting}
            />
            {errors.mobile && (
              <p id="apply-mobile-error" className="text-sm text-destructive">
                {errors.mobile}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="apply-email">Email</Label>
            <IconInput
              id="apply-email"
              icon={Mail}
              type="email"
              value={fields.email}
              onChange={(e) => set("email", e.target.value)}
              onBlur={() => touchField("email")}
              autoComplete="email"
              placeholder="jane@company.com"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "apply-email-error" : undefined}
              disabled={submitting}
            />
            {errors.email && (
              <p id="apply-email-error" className="text-sm text-destructive">
                {errors.email}
              </p>
            )}
          </div>
        </div>
      </fieldset>

      {/* KYC documents. The highest-anxiety step (handing over Aadhaar/PAN),
          so it gets a distinct container instead of the plain header every
          other section uses. Still no white card, per this form's blended-
          background convention: a low-opacity nav-tint wash + hairline
          nav-border, not bg-surface + shadow. rounded-xl is deliberately
          bigger than the rounded-lg controls inside it (container > content)
          but smaller than the rounded-2xl actual cards use elsewhere
          (contact-form.tsx, calculator-card.tsx), so this reads as a wash,
          not a card. Border stays neutral, not blue-tinted, so blue stays
          reserved for interactive/trust elements, not a static container. */}
      <fieldset className="border-0 border-t border-[var(--nav-border)] p-0 pt-8">
        <div className="rounded-xl border border-[var(--nav-border)] bg-[var(--nav-tint)]/30 p-5 sm:p-6">
          <SectionHeader
            icon={ShieldCheck}
            title="KYC documents"
            description="We verify these after you apply."
          />
          <div className="mt-5 grid min-w-0 grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
            <FileField
              id="apply-aadhaar-front"
              label="Aadhaar front"
              icon={IdCard}
              value={aadhaarFront}
              onChange={setAadhaarFront}
              error={fileErrors.aadhaarFront}
              disabled={submitting}
            />
            <FileField
              id="apply-aadhaar-back"
              label="Aadhaar back"
              icon={IdCard}
              value={aadhaarBack}
              onChange={setAadhaarBack}
              error={fileErrors.aadhaarBack}
              disabled={submitting}
            />
            <FileField
              id="apply-pan"
              label="PAN card"
              icon={CreditCard}
              value={pan}
              onChange={setPan}
              error={fileErrors.pan}
              disabled={submitting}
            />
            <FileField
              id="apply-photo"
              label="Your photo"
              icon={Camera}
              value={photo}
              onChange={setPhoto}
              accept="image/jpeg,image/png,image/webp"
              hint="JPG, PNG or WEBP"
              error={fileErrors.photo}
              disabled={submitting}
            />
          </div>
        </div>
      </fieldset>

      {/* RERA code, real estate only. Always mounted (not conditionally
          rendered) so both directions of the business-line toggle animate:
          collapsed via grid-template-rows 0fr -> 1fr, which transitions to
          the row's intrinsic height with pure CSS (the overflow-hidden div
          must be the direct grid item for the 0fr trick to clamp it below
          content size). inert removes it from the tab order and
          accessibility tree while collapsed, same technique already used by
          hero-carousel.tsx for off-screen slides; aria-hidden stays alongside
          for assistive tech that predates inert. fieldError('rera', ...)
          already returns undefined when line !== "real_estate", so no
          validation/progress-bar logic needs to change for this. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
          line === "real_estate" ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <fieldset
            aria-hidden={line !== "real_estate"}
            inert={line !== "real_estate" || undefined}
            className={cn(
              "grid min-w-0 gap-4 border-0 border-t border-[var(--nav-border)] p-0 pt-8",
              "transition-opacity duration-200 ease-out motion-reduce:transition-none",
              line === "real_estate" ? "opacity-100" : "opacity-0",
            )}
          >
            <SectionHeader title="RERA code" />
            <div className="grid gap-2">
              <Label htmlFor="apply-rera">RERA agent code</Label>
              <IconInput
                id="apply-rera"
                icon={BadgeCheck}
                value={fields.rera}
                onChange={(e) => set("rera", e.target.value)}
                onBlur={() => touchField("rera")}
                placeholder="e.g. A51900012345"
                aria-invalid={!!errors.rera}
                aria-describedby={errors.rera ? "apply-rera-error" : undefined}
                disabled={submitting}
              />
              {errors.rera && (
                <p id="apply-rera-error" className="text-sm text-destructive">
                  {errors.rera}
                </p>
              )}
            </div>
          </fieldset>
        </div>
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="h-12 bg-[var(--nav-primary)] text-base text-white hover:bg-[var(--nav-primary-hover)] focus-visible:ring-[var(--nav-primary)]"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {submitting ? "Sending code..." : "Continue"}
      </Button>
    </form>
  );
}
