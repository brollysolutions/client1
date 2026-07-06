"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { submitLead, type LeadBusinessLine } from "@/lib/leads";
import { isValidMobile, normalizeMobile } from "@/lib/phone";

// Per-line copy. The public landing page is blue-only (matches the navbar/hero
// primary); loans-green/realestate-amber are reserved for authenticated role
// dashboards later, so both triggers share the same accent here.
const LINE = {
  loans: {
    label: "Loans",
    title: "Talk to our loans team",
    description:
      "Leave your number and we'll call you back to match you with the right lender.",
    triggerClass:
      "bg-[var(--nav-primary)] text-white hover:bg-[var(--nav-primary-hover)] focus-visible:ring-[var(--nav-primary)]",
  },
  real_estate: {
    label: "Real Estate",
    title: "Talk to our real estate team",
    description:
      "Leave your number and we'll call you back about buying, renting, or listing.",
    triggerClass:
      "bg-[var(--nav-primary)] text-white hover:bg-[var(--nav-primary-hover)] focus-visible:ring-[var(--nav-primary)]",
  },
} satisfies Record<
  LeadBusinessLine,
  { label: string; title: string; description: string; triggerClass: string }
>;

export function LeadDialog({
  businessLine,
  triggerLabel = "Get a callback",
  product,
  triggerVariant = "solid",
  lineSelectable = false,
  origin,
  title,
  description,
  submitLabel = "Request callback",
}: {
  businessLine: LeadBusinessLine;
  triggerLabel?: string;
  // When set, the lead is tagged with this product and the dialog names it.
  product?: string;
  // "solid" = the primary section CTA; "outline" = the per-card secondary
  // button; "invert" = a white button for use on a solid blue surface.
  triggerVariant?: "solid" | "outline" | "invert";
  // When true, the form renders a loans/real-estate toggle and the submitted
  // business_line follows the user's pick instead of the fixed prop (used by
  // the agent-application flow, which recruits for both lines).
  lineSelectable?: boolean;
  // Overrides the default origin tag ("product-card" / "landing").
  origin?: string;
  // Copy overrides; fall back to the per-line copy below.
  title?: string;
  description?: string;
  submitLabel?: string;
}) {
  const [pickedLine, setPickedLine] = useState<LeadBusinessLine>(businessLine);
  const activeLine = lineSelectable ? pickedLine : businessLine;
  const line = LINE[activeLine];

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; mobile?: string }>({});

  function reset() {
    setName("");
    setMobile("");
    setErrors({});
    setSubmitting(false);
    setPickedLine(businessLine);
  }

  function validate() {
    const next: { name?: string; mobile?: string } = {};
    if (!name.trim()) next.name = "Please enter your name.";
    if (!isValidMobile(mobile))
      next.mobile = "Enter a valid 10-digit mobile number.";
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
      business_line: activeLine,
      origin: origin ?? (product ? "product-card" : "landing"),
      ...(product ? { product } : {}),
    });

    if (result.ok) {
      setOpen(false);
      reset();
      toast.success("Thanks! We'll call you back shortly.");
    } else {
      setSubmitting(false);
      toast.error(result.error || "Something went wrong. Please try again.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {triggerVariant === "outline" ? (
          <Button
            variant="outline"
            aria-label={product ? `Enquire about ${product}` : triggerLabel}
            className="w-full border-[var(--nav-primary)] text-[var(--nav-primary)] hover:bg-[var(--nav-tint)] hover:text-[var(--nav-primary-hover)]"
          >
            {triggerLabel}
          </Button>
        ) : triggerVariant === "invert" ? (
          <Button
            aria-label={triggerLabel}
            className="w-full bg-white text-[var(--nav-primary)] hover:bg-white/90 focus-visible:ring-white sm:w-auto"
          >
            {triggerLabel}
          </Button>
        ) : (
          <Button className={cn("w-full sm:w-auto", line.triggerClass)}>
            {triggerLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading">{title ?? line.title}</DialogTitle>
          <DialogDescription>
            {description ??
              (product
                ? `Leave your number and we'll call you back about ${product}.`
                : line.description)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="grid gap-4">
          {lineSelectable ? (
            <div className="grid gap-2">
              <Label id="lead-line-label">Which line?</Label>
              <div
                role="group"
                aria-labelledby="lead-line-label"
                className="grid grid-cols-2 gap-2"
              >
                {(["loans", "real_estate"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={pickedLine === option}
                    onClick={() => setPickedLine(option)}
                    disabled={submitting}
                    className={cn(
                      "rounded-md border px-3 py-2 text-sm font-medium transition",
                      pickedLine === option
                        ? "border-[var(--nav-primary)] bg-[var(--nav-primary)] text-white"
                        : "border-[var(--nav-border)] bg-transparent text-foreground hover:bg-[var(--nav-tint)]",
                    )}
                  >
                    {LINE[option].label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="lead-name">Name</Label>
            <Input
              id="lead-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "lead-name-error" : undefined}
              disabled={submitting}
            />
            {errors.name && (
              <p id="lead-name-error" className="text-sm text-destructive">
                {errors.name}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="lead-mobile">Mobile number</Label>
            <Input
              id="lead-mobile"
              type="tel"
              inputMode="numeric"
              value={mobile}
              onChange={(event) => setMobile(event.target.value)}
              autoComplete="tel"
              placeholder="98765 43210"
              aria-invalid={!!errors.mobile}
              aria-describedby={errors.mobile ? "lead-mobile-error" : undefined}
              disabled={submitting}
            />
            {errors.mobile && (
              <p id="lead-mobile-error" className="text-sm text-destructive">
                {errors.mobile}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="submit"
              className={line.triggerClass}
              disabled={submitting}
            >
              {submitting ? "Submitting..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
