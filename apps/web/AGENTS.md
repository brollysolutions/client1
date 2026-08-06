# Web instructions

Apply the root `AGENTS.md` plus these web-specific rules.

## Study path

Trace a web change through its App Router entry, feature/component, state or hook, API wrapper, generated contract type, backend endpoint, and nearby tests. Reuse the existing component system and look for an analogous screen before designing a new pattern.

## Boundaries and quality

- Keep server and client component boundaries intentional; add `"use client"` only where browser state or effects require it.
- Use `@contracts/generated/schema` types and existing API wrappers. Never recreate wire types by hand when the generated schema covers them.
- Treat decoded JWT claims and client-side role checks only as navigation hints; the API remains the security boundary.
- Preserve keyboard access, labels, focus behavior, semantic markup, loading/empty/error states, responsive layouts, and the light-only visual system.
- Avoid exposing secrets through `NEXT_PUBLIC_*`, logs, rendered errors, browser storage, or analytics.
- For user-visible changes, inspect the result in a real browser and cover the critical path with a unit or Playwright test when practical.

## Verification

Run targeted Vitest tests while iterating, then `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Run `pnpm test:e2e` for changed user journeys or document why it could not run.
