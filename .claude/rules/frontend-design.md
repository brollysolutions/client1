---
paths:
  - "apps/web/**/*.{ts,tsx,css}"
  - "packages/ui/**/*.{ts,tsx,css}"
---

# Frontend Design Rules

Every UI must feel intentionally designed, not merely functional.

Before coding:
- Read `docs/design/brand.md` and `docs/design/ui-principles.md`.
- Inspect existing components.
- Use shadcn MCP to find suitable components.
- Use Context7 for current Next.js, React, shadcn, and Tailwind docs.
- For complex pages, propose 2-3 design directions first.

Quality bar:
- Clear primary user goal.
- One dominant primary action.
- Consistent spacing scale.
- Strong typography hierarchy.
- Loading, empty, error, and success states.
- Mobile, tablet, and desktop layouts.
- Keyboard-accessible interactions.
- No random colors outside design tokens.
- No generic decorative gradients unless explicitly justified.

Line accents (locked palette):
- Loans surface = **green**; Real Estate surface = **amber**.
- The two accents never co-occur on a single working screen.

After coding:
- Run typecheck and lint.
- Inspect with Playwright MCP.
- Review visual hierarchy, spacing, responsiveness, and accessibility.
