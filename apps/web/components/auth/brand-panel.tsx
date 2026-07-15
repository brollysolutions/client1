import type { ReactNode } from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

import ForgotScene from "./illustrations/forgot-scene";
import LoginScene from "./illustrations/login-scene";
import RegisterScene from "./illustrations/register-scene";
import { StepIndicator } from "./step-indicator";

// The bespoke per-page illustration shown at the top of the panel. Keyed by
// auth flow so pages select one with a single `scene="login"` prop.
export type AuthScene = "login" | "register" | "forgot";
const SCENES: Record<AuthScene, ReactNode> = {
  login: <LoginScene />,
  register: <RegisterScene />,
  forgot: <ForgotScene />,
};

// Short reassurance cues shown at the foot of the panel. Kept factual and
// generic — no unverifiable claims.
const TRUST_CUES = ["Bank-grade security", "OTP verified", "Your data stays private"];

// The sky-blue left-hand panel shared by every auth screen. Sky gradient backdrop
// (soft white glows + a drifting dot texture) carries a bespoke per-page
// illustration, the screen's headline + subtext, the step indicator on multi-step
// flows, and a slim trust row at the foot. Shown only at lg+; AuthShell renders
// the form full-width below lg. The gradient stays in the sky-600..sky-800 band so
// white body text clears WCAG AA.
export function BrandPanel({
  title,
  subtitle,
  steps,
  activeStep,
  scene,
  className,
}: {
  title: string;
  subtitle: string;
  steps?: string[];
  activeStep?: number;
  scene?: AuthScene;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex-col overflow-hidden bg-gradient-to-br from-brand-cta via-brand-cta-hover to-brand-cta-deep p-8 text-white xl:p-12",
        className
      )}
    >
      {/* Soft white glows + a fine dot texture, gently animated over the sky
          gradient. Motion switches off under prefers-reduced-motion. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="auth-anim-float-a absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/20 blur-3xl" />
        <div className="auth-anim-float-b absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div
          className="auth-anim-drift absolute inset-0 opacity-15"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.35) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
      </div>

      {/* Hero: a large illustration capped to a share of the viewport height so
          it fills the panel without ever pushing the headline + subtitle + step
          indicator below the fold. The whole stack is vertically centred. */}
      <div className="auth-anim-fade-up relative flex flex-1 flex-col justify-center gap-6 xl:gap-8">
        {scene && (
          <div className="h-[34vh] w-full shrink-0 text-white">{SCENES[scene]}</div>
        )}
        <div className="shrink-0 space-y-4">
          <div className="space-y-3">
            <h2 className="max-w-md font-heading text-4xl font-bold leading-[1.1] xl:text-5xl">
              {title}
            </h2>
            <p className="max-w-md text-base leading-relaxed text-white/85">
              {subtitle}
            </p>
          </div>
          {steps && typeof activeStep === "number" && (
            <StepIndicator steps={steps} activeStep={activeStep} tone="sky" />
          )}
        </div>
      </div>

      {/* Slim trust row */}
      <div className="relative flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/75">
        {TRUST_CUES.map((cue) => (
          <span key={cue} className="inline-flex items-center gap-1.5">
            <Check className="h-4 w-4 text-white" strokeWidth={2.5} />
            {cue}
          </span>
        ))}
      </div>
    </div>
  );
}
