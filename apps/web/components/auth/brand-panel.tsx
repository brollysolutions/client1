import { Mail, Phone, User } from "lucide-react";

import { cn } from "@/lib/utils";

import { StepIndicator } from "./step-indicator";

// The navy left-hand panel shared by every auth screen. Carries the brand mark,
// a decorative avatar cluster, the screen's headline + subtext, and (on
// multi-step flows) the step indicator. Shown only at lg+; AuthShell renders a
// compact brand header in its place on smaller screens.
export function BrandPanel({
  title,
  subtitle,
  steps,
  activeStep,
  className,
}: {
  title: string;
  subtitle: string;
  steps?: string[];
  activeStep?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex-col overflow-hidden bg-brand-navy p-10 text-white xl:p-14",
        className
      )}
    >
      {/* Soft radial glows + a fine dot texture, gently animated. This is a
          deliberate recreation of the approved auth mockup, not a generic
          decorative gradient — the navy/sky palette is drawn straight from the
          brand tokens. Motion switches off under prefers-reduced-motion. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="auth-anim-float-a absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-blue/40 blur-3xl" />
        <div className="auth-anim-float-b absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-brand-blue/25 blur-3xl" />
        <div
          className="auth-anim-drift absolute inset-0 opacity-15"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.35) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
      </div>

      {/* Brand lockup */}
      <div className="relative flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-sky text-sm font-bold text-brand-navy">
          LR
        </span>
        <span className="font-heading text-lg font-semibold">
          Loans &amp; Real Estate
        </span>
      </div>

      {/* Decorative avatar cluster. Two rings pulse outward from the central
          node (second offset by half a cycle), and the contact badges bob —
          all aria-hidden and disabled under prefers-reduced-motion. */}
      <div className="relative flex flex-1 items-center justify-center py-10">
        <div className="relative flex h-52 w-52 items-center justify-center">
          <div className="auth-anim-ring absolute inset-4 rounded-full border border-brand-sky/50" />
          <div
            className="auth-anim-ring absolute inset-4 rounded-full border border-brand-sky/50"
            style={{ animationDelay: "1.7s" }}
          />
          <div className="flex h-28 w-28 items-center justify-center rounded-full border border-brand-sky/40 bg-white/10 backdrop-blur-sm">
            <User className="h-12 w-12 text-brand-sky" strokeWidth={1.5} />
          </div>
          <span className="auth-anim-badge-mail absolute -top-1 right-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-sky text-brand-navy shadow-lg">
            <Mail className="h-5 w-5" />
          </span>
          <span className="auth-anim-badge-phone absolute bottom-6 -left-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-sky text-brand-navy shadow-lg">
            <Phone className="h-5 w-5" />
          </span>
        </div>
      </div>

      {/* Headline + steps */}
      <div className="auth-anim-fade-up relative space-y-5">
        <div className="space-y-3">
          <h2 className="max-w-sm font-heading text-4xl font-bold leading-tight">
            {title}
          </h2>
          <p className="max-w-sm text-sm leading-relaxed text-white/70">
            {subtitle}
          </p>
        </div>
        {steps && typeof activeStep === "number" && (
          <StepIndicator steps={steps} activeStep={activeStep} tone="navy" />
        )}
      </div>
    </div>
  );
}
