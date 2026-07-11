import { Fragment } from "react";
import { ChevronDown } from "lucide-react";

// Quiet, collapsed disclosure directly under the calculator island. No icon,
// no page-width section band: this is a footnote for the curious, not a
// destination. `content` is a small markdown subset written in the registry
// (paragraphs, **bold**, a fenced ```formula``` block, and "- " bullets) so
// the formula and worked example stay visually distinct and legible instead
// of running together in one paragraph.
export function HowItsCalculated({ content }: { content: string }) {
  return (
    <details className="faq-details group mt-8 rounded-xl border border-[var(--nav-border)] bg-[var(--nav-bg)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-medium text-text-secondary marker:content-none hover:text-[var(--nav-text)]">
        How it&apos;s calculated
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden
        />
      </summary>
      <div className="px-5 pb-5 pt-1">
        <MarkdownLite content={content} />
      </div>
    </details>
  );
}

// Renders a fixed subset of markdown: blocks separated by blank lines, each
// either a ```fenced``` code block, a "- " bullet list, or a paragraph with
// inline **bold** and `code` spans. Deliberately not a general markdown
// renderer, just enough for the "how it's calculated" copy.
function MarkdownLite({ content }: { content: string }) {
  const blocks = content.trim().split(/\n\s*\n/);

  return (
    <div className="grid gap-4 text-base leading-relaxed text-[var(--nav-text)]">
      {blocks.map((block, i) => {
        const trimmed = block.trim();

        if (trimmed.startsWith("```")) {
          const code = trimmed.replace(/^```\w*\n?/, "").replace(/```$/, "");
          return (
            <pre
              key={i}
              className="overflow-x-auto rounded-lg border border-[var(--nav-border)] bg-white px-4 py-3 font-mono text-sm text-[var(--nav-text)]"
            >
              <code>{code}</code>
            </pre>
          );
        }

        const lines = trimmed.split("\n").map((l) => l.trim());
        if (lines.every((l) => l.startsWith("- "))) {
          return (
            <ul key={i} className="grid gap-1.5 pl-5">
              {lines.map((l, j) => (
                <li key={j} className="list-disc marker:text-[var(--nav-primary)]">
                  <InlineMarkdown text={l.slice(2)} />
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={i}>
            <InlineMarkdown text={trimmed} />
          </p>
        );
      })}
    </div>
  );
}

// Inline **bold** and `code` spans within one line of text.
function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-[var(--nav-text)]">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="rounded bg-[var(--nav-tint)] px-1.5 py-0.5 font-mono text-[0.9em] text-[var(--nav-primary)]"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
