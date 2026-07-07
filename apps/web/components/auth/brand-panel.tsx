import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

import { StepIndicator } from "./step-indicator";

// Short reassurance cues shown at the foot of the panel. Kept factual and
// generic — no unverifiable claims.
const TRUST_CUES = ["Bank-grade security", "OTP verified", "Your data stays private"];

// The navy left-hand panel shared by every auth screen. Ambient navy backdrop
// (radial glows + a drifting dot texture) with the screen's headline + subtext
// as the hero, the step indicator on multi-step flows, and a slim trust row at
// the foot. Shown only at lg+; AuthShell renders the form full-width below lg.
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
        "relative flex-col overflow-hidden bg-brand-navy p-12 text-white xl:p-16",
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

      {/* Hero: headline + subtitle vertically centred, with the step indicator
          (multi-step flows) sitting just beneath. */}
      <div className="auth-anim-fade-up relative flex flex-1 flex-col justify-center">
        <div className="space-y-6">
          <div className="space-y-4">
            <h2 className="max-w-md font-heading text-5xl font-bold leading-[1.1]">
              {title}
            </h2>
            <p className="max-w-md text-base leading-relaxed text-white/70">
              {subtitle}
            </p>
          </div>
          {steps && typeof activeStep === "number" && (
            <StepIndicator steps={steps} activeStep={activeStep} tone="navy" />
          )}
        </div>
      </div>

      {/* Slim trust row */}
      <div className="relative flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/60">
        {TRUST_CUES.map((cue) => (
          <span key={cue} className="inline-flex items-center gap-1.5">
            <Check className="h-4 w-4 text-brand-sky" strokeWidth={2.5} />
            {cue}
          </span>
        ))}
      </div>
    </div>
  );
}
