# Empty / Loading / Error / Success States

Every async surface must define all four.

- **Loading** — skeletons that match final layout; avoid layout shift; never a bare spinner on a full page.
- **Empty** — explain why it's empty and offer the next action (e.g. "No leads yet — introduce one").
- **Error** — user-safe message (never a stack trace), a retry affordance, and a support route where relevant.
- **Success** — confirmation feedback for writes (toast/inline), and the updated data reflected immediately.

Product-specific notes:
- Auth flows (OTP, reset) show resend cooldowns and lockout messaging (max 2 resends, 15-min lock).
- Money surfaces (transactions, payouts) distinguish `initiated` / `processing` / `paid` / `failed`.
