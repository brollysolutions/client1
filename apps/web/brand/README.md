# Dhanadhara identity

The owner supplied `source.png` (4.png) on 2026-09-07. Preserve its symbol and
blue/gold texture. The production wordmark is **Dhanadhara**, with no space,
typeset in Space Grotesk Bold. There is no tagline or decorative rule.

`source.png` is the untouched reference, including historical lettering; it is
not served as the production logo. The generator clips its symbol into an SVG
silhouette and renders the new wordmark with the actual font. The Latin WOFF2
is the same Space Grotesk variable font already downloaded by Next.js for this
app; its SIL Open Font License is included in `OFL.txt`.

Run `node scripts/generate-brand-assets.mjs` from apps/web to regenerate all
transparent PNG variants, icons, social artwork and the identical API asset.
It uses the existing Playwright dependency and installed Chromium, entirely
locally. Review the resulting artwork on cream and white backgrounds.

Two built-in imagegen extraction attempts were rejected because they altered
the source or lacked real transparency. No generated replacement symbol is used.
