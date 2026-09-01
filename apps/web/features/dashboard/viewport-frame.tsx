"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Renders children at a real desktop width, scaled down to fit the panel.
 *
 * The preview used to clamp `max-width` instead. Inside an ~480px authoring
 * column that clamp did nothing at 1440: the production carousel laid itself
 * out at 480 CSS pixels, so mobile breakpoints fired and "Desktop" showed
 * something no visitor would ever see. Setting a real width and scaling with a
 * transform keeps every media query resolving against the width being
 * previewed.
 *
 * One width, no switcher. A phone preview was offered alongside it and has been
 * withdrawn; re-adding it means restoring a width choice here and a control in
 * the panels that render this.
 *
 * The scaled content is inert: it is real production markup, and without this
 * its links and buttons would join the tab order twice over and its landmarks
 * would be announced as part of the authoring form.
 */
export const DESKTOP_VIEWPORT_WIDTH = 1440;

export function ViewportFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const outerRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(1);
  const [contentHeight, setContentHeight] = React.useState(0);

  React.useEffect(() => {
    const outer = outerRef.current;
    const content = contentRef.current;
    if (!outer || !content) return;

    const measure = () => {
      const available = outer.clientWidth;
      // Never scale up: in a panel wider than the page being previewed the
      // content should sit at its real size rather than be blown up.
      setScale(available > 0 ? Math.min(available / DESKTOP_VIEWPORT_WIDTH, 1) : 1);
      setContentHeight(content.offsetHeight);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  // Hug the scaled content rather than leaving it stranded at the left edge of
  // a panel wider than the page being previewed.
  const framedWidth = Math.round(DESKTOP_VIEWPORT_WIDTH * scale);

  return (
    <div ref={outerRef} className={cn("w-full", className)}>
      <div style={{ width: framedWidth || undefined }} className="mx-auto overflow-hidden bg-white">
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
              width: DESKTOP_VIEWPORT_WIDTH,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
            className="pointer-events-none absolute left-0 top-0 select-none"
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
