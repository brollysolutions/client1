---
paths:
  - "apps/web/**/*.{ts,tsx}"
---

# Next.js Frontend Rules

- Server Components by default; Client Components only for state, effects, browser APIs, forms,
  interactive widgets, or event handlers.
- Consume the generated typed API client from `packages/contracts`; never hand-duplicate backend types.
- Feature-specific components live in `features/<feature>/`; reusable primitives in `components/` or `packages/ui`.
- Gate route groups by role + held business line(s) from the JWT (404 before query on a line the user does not hold).
- Keep API errors user-friendly; handle auth/session edge cases (forced first-login password reset).
- No client-side secrets.
