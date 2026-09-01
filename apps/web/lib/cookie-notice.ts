export type CookieNoticeEntry = {
  name: string;
  category: "Essential";
  purpose: string;
  duration: string;
  protection: string;
};

export const NON_ESSENTIAL_COOKIES_ENABLED = false;

export const ESSENTIAL_COOKIES: CookieNoticeEntry[] = [
  {
    name: "refresh_token",
    category: "Essential",
    purpose:
      "Keeps a signed-in session active and rotates the session credential securely.",
    duration: "Up to 30 days under the current session policy, or until sign-out.",
    protection:
      "HttpOnly, Secure, SameSite=Strict, and limited to the refresh endpoint.",
  },
  {
    name: "session_hint",
    category: "Essential",
    purpose:
      "Lets routing know that it may check for a session. It never proves identity or grants access.",
    duration: "Up to 90 days, and cleared on sign-out or a failed session check.",
    protection: "Contains only the value 1; SameSite=Lax and Secure over HTTPS.",
  },
];

export const BROWSER_STORAGE = [
  {
    mechanism: "Local storage",
    purpose:
      "Remembers non-sensitive choices such as property and loan shortlists, the selected dashboard business line, and whether a session check may be useful.",
    duration: "Until you remove the choice, sign out where applicable, or clear browser data.",
  },
  {
    mechanism: "Session storage",
    purpose:
      "Carries short-lived registration and password-reset steps and prevents repeated error reloads within one tab.",
    duration: "Until the flow completes or the browser tab is closed.",
  },
] as const;
