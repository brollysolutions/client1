"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

// Long enough that most short blurbs never show a toggle; short enough that
// the always-visible head is never almost the whole description. The split
// lands on a word boundary so the visible head never ends mid-word.
const VISIBLE_CHARS = 360;
// Below this, collapsing buys nothing worth an aria-expanded control.
const TOGGLE_THRESHOLD = 420;

function splitAtWordBoundary(text: string, limit: number): { head: string; tail: string } {
  if (text.length <= limit) return { head: text, tail: "" };
  let cut = text.lastIndexOf(" ", limit);
  if (cut <= 0) cut = limit;
  return { head: text.slice(0, cut).trimEnd(), tail: text.slice(cut).trimStart() };
}

export function PropertyDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const needsToggle = text.length > TOGGLE_THRESHOLD;
  const { head, tail } = React.useMemo(
    () => (needsToggle ? splitAtWordBoundary(text, VISIBLE_CHARS) : { head: text, tail: "" }),
    [text, needsToggle],
  );

  if (!needsToggle) {
    return <p className="whitespace-pre-wrap text-sm leading-6 text-text-secondary">{text}</p>;
  }

  return (
    <div>
      <p className="whitespace-pre-wrap text-sm leading-6 text-text-secondary">{head}</p>
      {/* Grid + transition-[grid-template-rows] collapses/expands to the
          tail's intrinsic height in pure CSS, no measurement needed. Tailwind
          Preflight zeroes <p> margins, so this block sits flush under the
          head paragraph above and reads as one continuous passage. The 0fr/1fr
          row must wrap a direct overflow-hidden child for the trick to clamp
          below content size. inert removes the collapsed tail from the tab
          order and a11y tree; aria-hidden covers assistive tech that predates
          inert. Same pattern already used at
          components/apply-as-agent/agent-application-form.tsx:598-624. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <p
            id="property-description-tail"
            aria-hidden={!expanded}
            inert={!expanded || undefined}
            className={cn(
              "whitespace-pre-wrap text-sm leading-6 text-text-secondary transition-opacity duration-200 ease-out motion-reduce:transition-none",
              expanded ? "opacity-100" : "opacity-0",
            )}
          >
            {tail}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-controls="property-description-tail"
        className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-sm text-sm font-medium text-[var(--nav-primary)] transition-colors hover:text-[var(--nav-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-primary)] focus-visible:ring-offset-2"
      >
        {expanded ? "See less" : "See more"}
        <ChevronDown
          className={cn("h-4 w-4 transition-transform duration-200 motion-reduce:transition-none", expanded && "rotate-180")}
          aria-hidden
        />
      </button>
    </div>
  );
}
