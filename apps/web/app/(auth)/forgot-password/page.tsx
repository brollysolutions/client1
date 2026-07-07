"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Lock, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth/auth-shell";
import { OtpForm } from "@/components/auth/otp-form";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import {
  forgotInitiate,
  forgotReset,
  forgotVerify,
  resendOtp,
  RESET_MOBILE_KEY,
} from "@/lib/auth";
import { formatMobile, isValidMobile, toE164 } from "@/lib/phone";

const STEPS = ["Verify number", "New password"];

// No mobile-entry view: this screen is reached only from /login's "Forgot
// password?" button, which hands the number over via RESET_MOBILE_KEY. We send
// the code and land straight on OTP; a direct visit with no number redirects
// back to /login. "loading" covers the brief auto-send before OTP shows.
type View = "loading" | "otp" | "reset";

const PANEL: Record<View, { title: string; subtitle: string; step: number }> = {
  loading: {
    title: "Let's get you back in.",
    subtitle:
      "Verify your identity with the code we sent to your registered mobile number.",
    step: 0,
  },
  otp: {
    title: "Let's get you back in.",
    subtitle:
      "Verify your identity with the code we sent to your registered mobile number.",
    step: 0,
  },
  reset: {
    title: "Almost there.",
    subtitle:
      "Set a new password and you'll be signed straight back into your account.",
    step: 1,
  },
};

function IconBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-sky/25 text-brand-navy">
      {children}
    </span>
  );
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [view, setView] = React.useState<View>("loading");

  const [mobile, setMobile] = React.useState("");
  const [e164, setE164] = React.useState("");
  const [resetToken, setResetToken] = React.useState("");

  // Sends the reset code and moves to the OTP view. If it fails we send the user
  // back to /login rather than stranding them on the loading state.
  async function sendCode(rawMobile: string) {
    const mobileE164 = toE164(rawMobile);
    const result = await forgotInitiate(mobileE164);

    if (result.ok) {
      setE164(mobileE164);
      setView("otp");
      if (result.data.otpHint) {
        toast.info("Dev verification code", { description: result.data.otpHint });
      }
    } else {
      toast.error(result.error || "Couldn't send a code", {
        description: "Please try again in a moment.",
      });
      router.replace("/login");
    }
  }

  // Reset always starts on /login, which stashes the number under
  // RESET_MOBILE_KEY. Grab it, send the OTP straight away, and drop the user on
  // the verification step. No number (direct visit / refresh) => back to login.
  // The ref guard stops React strict-mode's double mount from sending twice.
  const autoSent = React.useRef(false);
  React.useEffect(() => {
    if (autoSent.current) return;
    autoSent.current = true;
    const stored = sessionStorage.getItem(RESET_MOBILE_KEY);
    if (!stored || !isValidMobile(stored)) {
      router.replace("/login");
      return;
    }
    sessionStorage.removeItem(RESET_MOBILE_KEY);
    setMobile(stored);
    void sendCode(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const panel = PANEL[view];

  return (
    <AuthShell
      panelTitle={panel.title}
      panelSubtitle={panel.subtitle}
      steps={STEPS}
      activeStep={panel.step}
    >
      {view === "loading" && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-navy" />
          <p className="text-sm text-text-secondary">Sending your code…</p>
        </div>
      )}

      {view === "otp" && (
        <>
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="mb-8 inline-flex cursor-pointer items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary focus-visible:text-text-primary focus-visible:outline-none"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </button>

          <IconBadge>
            <Smartphone className="h-6 w-6" />
          </IconBadge>

          <div className="mb-6 space-y-2">
            <h1 className="font-heading text-3xl font-bold text-text-primary">
              Reset your password
            </h1>
            <p className="text-sm text-text-secondary">
              We&apos;ve sent a 6-digit verification code to{" "}
              <span className="font-medium text-text-primary">
                {formatMobile(mobile)}
              </span>
              . Enter it below to continue.
            </p>
          </div>

          <OtpForm
            submitLabel="Continue"
            onSubmit={async (otp) => {
              const result = await forgotVerify(e164, otp);
              if (result.ok) {
                setResetToken(result.data.resetToken);
                setView("reset");
              }
              return result;
            }}
            onResend={() => resendOtp(e164, "reset")}
          />
        </>
      )}

      {view === "reset" && (
        <>
          <IconBadge>
            <Lock className="h-6 w-6" />
          </IconBadge>

          <div className="mb-6 space-y-2">
            <h1 className="font-heading text-3xl font-bold text-text-primary">
              Set a new password
            </h1>
            <p className="text-sm text-text-secondary">
              Create a new password for your account.
            </p>
          </div>

          <SetPasswordForm
            passwordLabel="New password"
            submitLabel="Reset password"
            onSubmit={async (password, confirm) => {
              const result = await forgotReset(resetToken, password, confirm);
              if (result.ok) {
                toast.success("Password updated", {
                  description: "You can log in with your new password now.",
                });
                router.push("/login");
              }
              return result;
            }}
          />
        </>
      )}
    </AuthShell>
  );
}
