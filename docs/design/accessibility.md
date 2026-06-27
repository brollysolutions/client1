# Accessibility

Baseline: WCAG 2.1 AA.

- All interactive elements are keyboard reachable and operable; visible focus states.
- Forms: programmatic labels, helper text, and inline validation tied to fields via `aria-describedby`.
- Colour is never the only signal — pair the line accent (green/amber) with text/icons.
- Sufficient contrast for text and essential UI against background.
- Images/media have alt text; decorative media is `aria-hidden`.
- Respect `prefers-reduced-motion`.
- Verify with Playwright MCP accessibility-tree inspection after UI changes.
