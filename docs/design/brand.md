# Brand

The client supplies the domain, logo, colour theme, and referral-document colours/content
(SRS Appendix B). Until those land, the locked rule below governs all surfaces.

## Locked line palette

| Business line | Accent | Usage |
|---|---|---|
| Loans | **Green** | loan journey, loan-lead workspaces, loan banners |
| Real Estate | **Amber** | property journey, listing/visit workspaces, RE banners |

Rules:
- The two accents **never co-occur on a single working screen**. A `both` client switches between
  a green loans area and an amber real-estate area.
- Admin / Sub Admin chrome is **neutral**; each record renders its own line accent (green/amber).
- Define accents as Tailwind/CSS design tokens (e.g. `--accent-loans`, `--accent-realestate`).
  Never hardcode hex values in components.

## Voice

Clear, trustworthy, regulatory-aware (RERA, financial record-keeping). No hype. Plain language for
status, money, and consent.

## Pending client inputs

- [ ] Domain
- [ ] Logo
- [ ] Exact brand hex values / theme
- [ ] Referral-document colour combination + content
