"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { submitLead, type LeadBusinessLine } from "@/lib/leads";
import { isValidMobile, normalizeMobile } from "@/lib/phone";

// Standalone enquiry form for the /contact page. Reuses the same building
// blocks as the LeadDialog modal (lib/leads submitLead + lib/phone helpers)
// without refactoring the working dialog. Blue-only, per the public-site
// palette. submitLead is a stub until the public POST /api/v1/leads lands.
const LINES: { value: LeadBusinessLine; label: string }[] = [
  { value: "loans", label: "Loans" },
  { value: "real_estate", label: "Real Estate" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ContactForm() {
  const [line, setLine] = useState<LeadBusinessLine>("loans");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
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
      business_line: line,
      origin: "contact",
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(message.trim() ? { message: message.trim() } : {}),
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
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-[var(--nav-border)] bg-surface p-8 text-center shadow-sm sm:p-10">
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
    <form
      onSubmit={handleSubmit}
      noValidate
      className="grid gap-5 rounded-2xl border border-[var(--nav-border)] bg-surface p-6 shadow-sm sm:p-8"
    >
      <div className="grid gap-2">
        <Label id="contact-line-label">What is this about?</Label>
        <div
          role="group"
          aria-labelledby="contact-line-label"
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
                "rounded-md border px-3 py-2 text-sm font-medium transition",
                line === option.value
                  ? "border-[var(--nav-primary)] bg-[var(--nav-primary)] text-white"
                  : "border-[var(--nav-border)] bg-transparent text-foreground hover:bg-[var(--nav-tint)]",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="contact-name">Name</Label>
        <Input
          id="contact-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
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
        <Input
          id="contact-mobile"
          type="tel"
          inputMode="numeric"
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
        <Input
          id="contact-email"
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
          disabled={submitting}
        />
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="bg-[var(--nav-primary)] text-white hover:bg-[var(--nav-primary-hover)] focus-visible:ring-[var(--nav-primary)]"
      >
        {submitting ? "Sending..." : "Send message"}
      </Button>
    </form>
  );
}
