"use client";

import * as React from "react";
import { Monitor, Smartphone, X } from "lucide-react";

import { CLOSE_BUTTON_CLASS } from "@/components/ui/close-button";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Two dialog shapes for staff detail surfaces.
 *
 * `WORKSPACE_DIALOG_CLASS` is the full-screen "floating window": a fixed
 * 100dvh sheet anchored to the viewport. Reserve it for bodies that genuinely
 * need the whole screen and whose height does not follow their content — a
 * financial product's form builder, a CMS draft beside its live preview, a
 * property submission with its media grid and RERA panel.
 *
 * `PANEL_DIALOG_CLASS` is the default for everything else: a centred dialog
 * that grows with its content and stops at `max-h-[85vh]`, so a short progress
 * form no longer paints a full-screen sheet around itself. Reach for
 * `PANEL_DIALOG_WIDE_CLASS` only when the body is a two-column
 * `WorkspaceLayout` that cannot fit in `max-w-3xl`.
 *
 * Pair any of them with `showCloseButton={false}` and render
 * `WorkspaceDialogHeader`, which owns the close control so it aligns with the
 * title rather than floating over the content.
 */
export const WORKSPACE_DIALOG_CLASS =
  "!top-4 !left-4 !grid h-[calc(100dvh-2rem)] !w-[calc(100%-2rem)] !max-w-none !translate-x-0 !translate-y-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl p-5 sm:!max-w-none sm:p-6";

/** Same shape, with a third row for a filter bar between header and body. */
export const WORKSPACE_DIALOG_FILTERED_CLASS =
  "!top-4 !left-4 !grid h-[calc(100dvh-2rem)] !w-[calc(100%-2rem)] !max-w-none !translate-x-0 !translate-y-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden rounded-xl p-5 sm:!max-w-none sm:p-6";

/** Centred, content-sized. The default detail surface. */
export const PANEL_DIALOG_CLASS =
  "!grid max-h-[85vh] w-[calc(100%-2rem)] !max-w-3xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl p-5 sm:p-6";

/** Content-sized, with a third row for a filter bar between header and body. */
export const PANEL_DIALOG_FILTERED_CLASS =
  "!grid max-h-[85vh] w-[calc(100%-2rem)] !max-w-5xl grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden rounded-xl p-5 sm:p-6";

/** Content-sized, for a two-column `WorkspaceLayout` that needs more width. */
export const PANEL_DIALOG_WIDE_CLASS =
  "!grid max-h-[85vh] w-[calc(100%-2rem)] !max-w-5xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl p-5 sm:p-6";

export function WorkspaceDialogHeader({
  title,
  description,
  actions,
  closeLabel = "Close workspace",
}: {
  title: string;
  description?: string;
  /** Rendered left of the close control — status pills, primary actions. */
  actions?: React.ReactNode;
  closeLabel?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
      <DialogHeader className="min-w-0 text-left">
        <DialogTitle className="truncate">{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
      </DialogHeader>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        <DialogClose asChild>
          <button type="button" className={CLOSE_BUTTON_CLASS}>
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{closeLabel}</span>
          </button>
        </DialogClose>
      </div>
    </div>
  );
}

export function WorkspaceLayout({
  editor,
  preview,
}: {
  editor: React.ReactNode;
  /** Optional right column; without it the editor gets the full width. */
  preview?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "min-h-0 overflow-y-auto",
        preview && "grid gap-5 xl:grid-cols-[minmax(22rem,0.85fr)_minmax(30rem,1.15fr)]",
      )}
    >
      <div className="min-w-0 py-1">{editor}</div>
      {preview ? (
        <aside className="min-w-0 py-1 xl:sticky xl:top-0 xl:self-start">{preview}</aside>
      ) : null}
    </div>
  );
}

export type PreviewDevice = "desktop" | "mobile";

export function WorkspacePreviewFrame({
  title,
  description,
  contexts,
  context,
  onContextChange,
  device,
  onDeviceChange,
  footnote = "Preview only. Approval, targeting, schedule, ranking, and page context determine actual visibility.",
  children,
}: {
  title: string;
  description: string;
  contexts?: readonly { value: string; label: string }[];
  context?: string;
  onContextChange?: (value: string) => void;
  device: PreviewDevice;
  onDeviceChange: (device: PreviewDevice) => void;
  footnote?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="space-y-3 rounded-xl border border-border bg-muted/20 p-4"
      aria-label={`${title} preview`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <p className="mt-0.5 text-xs leading-5 text-text-secondary">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {contexts && context && onContextChange ? (
            <Tabs value={context} onValueChange={onContextChange}>
              <TabsList aria-label="Preview context">
                {contexts.map((item) => (
                  <TabsTrigger key={item.value} value={item.value}>
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : null}
          <div className="flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Preview size">
            <Button
              type="button"
              size="icon"
              variant={device === "desktop" ? "outline" : "ghost"}
              onClick={() => onDeviceChange("desktop")}
              aria-label="Desktop preview"
            >
              <Monitor className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={device === "mobile" ? "outline" : "ghost"}
              onClick={() => onDeviceChange("mobile")}
              aria-label="Mobile preview"
            >
              <Smartphone className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-white p-3">
        <div
          className={cn(
            "mx-auto transition-[max-width]",
            device === "mobile" ? "max-w-[390px]" : "max-w-none",
          )}
        >
          {children}
        </div>
      </div>
      <p className="text-xs text-text-secondary">{footnote}</p>
    </section>
  );
}
