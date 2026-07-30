import type { PublicContentBlock } from "@/lib/public-content-blocks";

// Renders a single Sub-Admin-authored content block, fetched by its unique
// slug (docs/specs/public-content-block-serving.md) via
// getPublicContentBlockBySlug. Renders nothing (returns null) when no
// published block has that slug yet, or its body is empty -- same "don't
// render an empty state" convention as offer-strip.tsx: this is
// supplementary editorial copy, not primary page content, so absence should
// read as silence, not a broken-looking gap. Also absorbs a failed fetch the
// same way, since lib/public-content-blocks.ts never distinguishes the two.
export function ContentBlockSection({ block }: { block: PublicContentBlock | null }) {
  if (!block || !block.body) return null;

  return (
    <section className="w-full border-t border-[var(--nav-border)] bg-[var(--nav-bg)]">
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
        <h2 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
          {block.title}
        </h2>
        <p className="mt-4 whitespace-pre-wrap text-base text-text-secondary">{block.body}</p>
      </div>
    </section>
  );
}
