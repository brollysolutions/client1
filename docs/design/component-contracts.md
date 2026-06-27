# Component Contracts

Reusable primitives live in `packages/ui`; feature components in `apps/web/features/<feature>/`.

Every shared component declares:
- **Props** — typed, minimal, no leaking backend shapes (use generated contract types).
- **States** — default, loading, empty, error, disabled, success.
- **Variants** — line accent where relevant (`loans` | `realestate` | `neutral`).
- **Accessibility** — roles, labels, keyboard interaction, focus order.
- **Responsiveness** — mobile / tablet / desktop behavior.

Prefer composing shadcn/ui primitives over bespoke elements. A component that diverges across
pages is a signal to promote a primitive into `packages/ui`.
