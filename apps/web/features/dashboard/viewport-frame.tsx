"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Renders children at a real device width, scaled down to fit the panel.
 *
 * The preview used to clamp `max-width` to 1440/768/390 instead. Inside an
 * ~480px authoring column that clamp did nothing at 1440: the production
 * carousel laid itself out at 480 CSS pixels, so mobile breakpoints fired and
 * "Desktop" showed something no visitor would ever see. Setting a real width
 * and scaling with a transform keeps every media query resolving against the
 * device width being previewed.
 *
 * The scaled content is inert: it is real production markup, and without this
 * its links and buttons would join the tab order twice over and its landmarks
 * would be announced as part of the authoring form.
 */
export const VIEWPORT_WIDTHS = { desktop: 1440, tablet: 768, mobile: 390 } as const;

export type ViewportName = keyof typeof VIEWPORT_WIDTHS;

export function ViewportFrame({
  viewport,
  children,
  className,
}: {
  viewport: ViewportName;
  children: React.ReactNode;
  className?: string;
}) {
  const outerRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const width = VIEWPORT_WIDTHS[viewport];
  const [scale, setScale] = React.useState(1);
  const [contentHeight, setContentHeight] = React.useState(0);

  React.useEffect(() => {
    const outer = outerRef.current;
    const content = contentRef.current;
    if (!outer || !content) return;

    const measure = () => {
      const available = outer.clientWidth;
      // Never scale up: a 390px mobile frame inside a wide panel should sit at
      // its real size rather than being blown up into a caricature.
      setScale(available > 0 ? Math.min(available / width, 1) : 1);
      setContentHeight(content.offsetHeight);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(content);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div ref={outerRef} className={cn("w-full overflow-hidden", className)}>
      <div
        style={{ height: contentHeight ? contentHeight * scale : undefined }}
        className="relative w-full"
      >
        <div
          ref={contentRef}
          // `inert` keeps the whole scaled tree out of the tab order and the
          // accessibility tree; the React 19 DOM attribute is a boolean.
          inert
          style={{
            width,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          className="pointer-events-none absolute left-0 top-0 select-none"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function viewportLabel(viewport: ViewportName): string {
  if (viewport === "mobile") return "Mobile";
  if (viewport === "tablet") return "Tablet";
  return "Desktop";
}
