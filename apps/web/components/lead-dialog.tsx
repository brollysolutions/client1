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

// Per-line copy + accent. Loans = green, Real Estate = amber. The two never
// meet on one card, so within a single dialog only one accent is ever used.
const LINE = {
  loans: {
    label: "Loans",
    title: "Talk to our loans team",
    description:
      "Leave your number and we'll call you back to match you with the right lender.",
    triggerClass:
      "bg-loans-accent text-white hover:bg-loans-accent/90 focus-visible:ring-loans-accent",
  },
  real_estate: {
    label: "Real Estate",
    title: "Talk to our real estate team",
    description:
      "Leave your number and we'll call you back about buying, renting, or listing.",
    triggerClass:
      "bg-realestate-accent text-white hover:bg-realestate-accent/90 focus-visible:ring-realestate-accent",
  },
} satisfies Record<
  LeadBusinessLine,
  { label: string; title: string; description: string; triggerClass: string }
>;

// Indian mobile: 10 digits, leading 6-9. We strip a +91 / 0 prefix first so a
// pasted number in either form still validates.
function normalizeMobile(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

function isValidMobile(raw: string): boolean {
  return /^[6-9]\d{9}$/.test(normalizeMobile(raw));
}

export function LeadDialog({
  businessLine,
  triggerLabel = "Get a callback",
}: {
  businessLine: LeadBusinessLine;
  triggerLabel?: string;
}) {
  const line = LINE[businessLine];

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
      business_line: businessLine,
      origin: "landing",
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
        <Button className={cn("w-full sm:w-auto", line.triggerClass)}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading">{line.title}</DialogTitle>
          <DialogDescription>{line.description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="grid gap-4">
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
              {submitting ? "Submitting..." : "Request callback"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
