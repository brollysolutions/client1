"use client";

import { useState } from "react";
import { Check, Loader2, Mail, User } from "lucide-react";
import { toast } from "sonner";

import { MobileInput } from "@/components/auth/mobile-input";
import { IconInput } from "@/components/icon-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { submitLead, type LeadTopic } from "@/lib/leads";
import { isValidMobile, normalizeMobile } from "@/lib/phone";

// Standalone enquiry form for the /contact page. Same field idiom as the
// agent application form (IconInput, MobileInput, h-12 controls) and the same
// blended-background convention: no white card, the form sits directly on the
// cream section. Blue-only, per the public-site palette.
const TOPICS: { value: LeadTopic; label: string }[] = [
  { value: "loans", label: "Loans" },
  { value: "real_estate", label: "Real Estate" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ContactForm({
  initialLine,
  initialProduct,
  invitationToken,
}: {
  // Prefilled from the /contact query string when a visitor arrives via an
  // Enquire / callback CTA, so the telecaller sees what they came for.
  initialLine?: LeadTopic;
  initialProduct?: string;
  invitationToken?: string;
} = {}) {
  const [topic, setTopic] = useState<LeadTopic>(initialLine ?? "loans");
  // When the visitor arrived via a category-specific CTA (?line=...), lock the
  // form to that one enquiry and drop the other two options. A direct visit
  // (NavBar / footer / a generic "get started" button) leaves all three
  // selectable. `topic` is already fixed to `initialLine` above.
  const locked = initialLine != null;
  const lockedLabel = TOPICS.find((t) => t.value === initialLine)?.label ?? "";
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  // Honeypot. Humans never see or fill this; bots auto-filling every field do.
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState(
    initialProduct ? `I'm interested in ${initialProduct}.` : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<{
    name?: string;
    mobile?: string;
    email?: string;
  }>({});

  function validate() {
    const next: { name?: string; mobile?: string; email?: string } = {};
    if (!name.trim()) next.name = "Please enter your name.";
    if (!isValidMobile(mobile))
      next.mobile = "Enter a valid 10-digit mobile number.";
    if (email.trim() && !EMAIL_RE.test(email.trim()))
      next.email = "Enter a valid email address.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!validate()) return;

    setSubmitting(true);
    const result = await submitLead({
      name: name.trim(),
      mobile: normalizeMobile(mobile),
      business_line: topic,
      origin: "contact",
      ...(initialProduct ? { product: initialProduct } : {}),
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(message.trim() ? { message: message.trim() } : {}),
      ...(company ? { company } : {}),
      ...(invitationToken ? { invitation_token: invitationToken } : {}),
    });

    if (result.ok) {
      setName("");
      setMobile("");
      setEmail("");
      setMessage("");
      setErrors({});
      setSubmitting(false);
      setDone(true);
      toast.success("Thanks! We'll call you back shortly.");
    } else {
      setSubmitting(false);
      toast.error(result.error || "Something went wrong. Please try again.");
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--nav-tint)] text-[var(--nav-primary)]">
          <Check className="h-7 w-7" aria-hidden />
        </span>
        <h3 className="font-heading text-xl font-semibold text-foreground">
          Message received
        </h3>
        <p className="max-w-sm text-text-secondary">
          Thanks for reaching out. Our team will call you back shortly.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => setDone(false)}
          className="border-[var(--nav-primary)] text-[var(--nav-primary)] hover:bg-[var(--nav-tint)] hover:text-[var(--nav-primary-hover)]"
        >
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      {/* Honeypot: off-screen, out of the tab order, invisible to AT. */}
      <div aria-hidden className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="contact-company">Company</label>
        <input
          id="contact-company"
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
        />
      </div>

      {initialProduct ? (
        <div className="grid gap-1.5">
          <span className="text-sm text-text-secondary">Enquiring about</span>
          <span className="inline-flex w-fit max-w-full items-center rounded-full bg-[var(--nav-tint)] px-3 py-1 text-sm font-medium text-[var(--nav-primary)]">
            {initialProduct}
          </span>
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label id="contact-line-label">What is this about?</Label>
        {locked ? (
          <div
            aria-labelledby="contact-line-label"
            className="inline-flex h-12 w-fit items-center rounded-lg border border-[var(--nav-primary)] bg-[var(--nav-primary)] px-6 text-sm font-medium text-white"
          >
            {lockedLabel}
          </div>
        ) : (
          <div
            role="group"
            aria-labelledby="contact-line-label"
            className="grid grid-cols-2 gap-2"
          >
            {TOPICS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={topic === option.value}
                onClick={() => setTopic(option.value)}
                disabled={submitting}
                className={cn(
                  "h-12 cursor-pointer rounded-lg border px-2 text-sm font-medium transition",
                  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--nav-primary)]/50",
                  "disabled:cursor-default disabled:opacity-50",
                  topic === option.value
                    ? "border-[var(--nav-primary)] bg-[var(--nav-primary)] text-white"
                    : "border-[var(--nav-border)] bg-transparent text-foreground hover:bg-[var(--nav-tint)]",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="contact-name">Name</Label>
        <IconInput
          id="contact-name"
          icon={User}
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          placeholder="Your full name"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "contact-name-error" : undefined}
          disabled={submitting}
        />
        {errors.name && (
          <p id="contact-name-error" className="text-sm text-destructive">
            {errors.name}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="contact-mobile">Mobile number</Label>
        <MobileInput
          id="contact-mobile"
          value={mobile}
          onChange={(event) => setMobile(event.target.value)}
          autoComplete="tel"
          placeholder="98765 43210"
          aria-invalid={!!errors.mobile}
          aria-describedby={errors.mobile ? "contact-mobile-error" : undefined}
          disabled={submitting}
        />
        {errors.mobile && (
          <p id="contact-mobile-error" className="text-sm text-destructive">
            {errors.mobile}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="contact-email">
          Email <span className="text-text-secondary">(optional)</span>
        </Label>
        <IconInput
          id="contact-email"
          icon={Mail}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "contact-email-error" : undefined}
          disabled={submitting}
        />
        {errors.email && (
          <p id="contact-email-error" className="text-sm text-destructive">
            {errors.email}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="contact-message">
          Message <span className="text-text-secondary">(optional)</span>
        </Label>
        <Textarea
          id="contact-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Tell us a little about what you need."
          rows={4}
          className="rounded-lg text-base"
          disabled={submitting}
        />
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="h-12 bg-[var(--nav-primary)] text-base text-white hover:bg-[var(--nav-primary-hover)] focus-visible:ring-[var(--nav-primary)]"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {submitting ? "Sending..." : "Send message"}
      </Button>
    </form>
  );
}
