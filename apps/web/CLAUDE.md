# Web App Guide

Scope: Next.js App Router frontend in `apps/web`.

## Architecture

- Server Components by default.
- Client Components only for state, effects, browser APIs, forms, interactive widgets, or event handlers.
- Use typed API client generated from FastAPI OpenAPI (`packages/contracts`).
- Keep feature-specific components in `features/<feature>/`.
- Keep reusable primitives in `components/` or `packages/ui`.

## UI Rules

- Use shadcn/ui before custom primitives.
- Use Tailwind tokens; avoid arbitrary colors and random spacing.
- Loans surface = **green**, Real Estate surface = **amber**. Never mix the two accents on one
  working screen — a `both` client switches between a green loans area and an amber real-estate area.
- Build empty, loading, error, and success states.
- Validate responsive layouts.
- Check keyboard accessibility.
- Use Playwright MCP for visual/browser inspection after UI changes.

## Role surfaces (this product)

- Six role dashboards: Admin, Sub Admin, Agent, Telecaller, Employee, Client. Route groups are
  gated by the role + held line(s) in the JWT (a loans-only client hitting a real-estate route 404s before any query).
- The client surface is multi-line (may hold both); Agent/Telecaller/Employee surfaces are single-line.

## Data Rules

- Do not duplicate backend types manually if generated types exist.
- Keep API errors user-friendly.
- Handle auth/session edge cases (forced password reset on first login for provisioned accounts).
- Avoid client-side secrets.
