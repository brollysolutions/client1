// Shared class strings for the auth surface's sky-blue accents. Kept in one place
// so the login / register / forgot pages and the shared otp / set-password forms
// stay in sync instead of repeating the same override at each call site.
//
// These are auth-only. The shared shadcn Button default variant (bg-brand-navy)
// and dashboards are untouched; AUTH_SUBMIT_CLASS is appended after the Button
// base so tailwind-merge swaps navy -> sky for auth submit buttons only.

// Auth submit button: sky fill + hover + focus ring. Append after the <Button>
// className (default variant), e.g. cn(AUTH_SUBMIT_CLASS, "h-12 w-full text-base").
export const AUTH_SUBMIT_CLASS =
  "bg-brand-cta text-white hover:bg-brand-cta-hover focus-visible:ring-brand-cta";

// Inline text links (Forgot password?, Sign up, Log in, Resend).
export const AUTH_LINK_CLASS = "text-brand-cta hover:text-brand-cta-hover";

// "Back to home" / "Back to login" link: muted by default, lights up sky on
// hover/focus to match the home navbar accent.
export const AUTH_BACK_LINK_CLASS =
  "text-text-secondary transition-colors hover:text-brand-cta focus-visible:text-brand-cta";
