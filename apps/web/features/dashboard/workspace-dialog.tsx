"use client";

import * as React from "react";
import { X } from "lucide-react";

import { CLOSE_BUTTON_CLASS } from "@/components/ui/close-button";
import { DialogClose, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { DESKTOP_VIEWPORT_WIDTH, ViewportFrame } from "./viewport-frame";

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
 * that grows with its content and stops at `max-h-[calc(100dvh-2rem)] sm:max-h-[85dvh]`, so a short progress
 * form no longer paints a full-screen sheet around itself. Reach for
 * `PANEL_DIALOG_WIDE_CLASS` only when the body is a two-column
 * `WorkspaceLayout` that cannot fit in `max-w-3xl`.
 *
 * Pair any of them with `showCloseButton={false}` and render
 * `WorkspaceDialogHeader`, which owns the close control so it aligns with the
 * title rather than floating over the content.
 */
export const WORKSPACE_DIALOG_CLASS =
  "!top-4 !left-4 !grid h-[calc(100dvh-2rem)] !w-[calc(100%-2rem)] !max-w-none !translate-x-0 !translate-y-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl p-3 sm:!max-w-none sm:p-6";

/** Same shape, with a third row for a filter bar between header and body. */
export const WORKSPACE_DIALOG_FILTERED_CLASS =
  "!top-4 !left-4 !grid h-[calc(100dvh-2rem)] !w-[calc(100%-2rem)] !max-w-none !translate-x-0 !translate-y-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden rounded-xl p-3 sm:!max-w-none sm:p-6";

/** Centred, content-sized. The default detail surface. */
export const PANEL_DIALOG_CLASS =
  "!grid max-h-[calc(100dvh-2rem)] sm:max-h-[85dvh] w-[calc(100%-2rem)] !max-w-3xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl p-3 sm:p-6";

/** Content-sized, with a third row for a filter bar between header and body. */
export const PANEL_DIALOG_FILTERED_CLASS =
  "!grid max-h-[calc(100dvh-2rem)] sm:max-h-[85dvh] w-[calc(100%-2rem)] !max-w-5xl grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden rounded-xl p-3 sm:p-6";

/** Content-sized, for a two-column `WorkspaceLayout` that needs more width. */
export const PANEL_DIALOG_WIDE_CLASS =
  "!grid max-h-[calc(100dvh-2rem)] sm:max-h-[85dvh] w-[calc(100%-2rem)] !max-w-5xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-xl p-3 sm:p-6";

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
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
      <DialogHeader className="min-w-0 flex-1 text-left">
        <DialogTitle className="break-words leading-snug">{title}</DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
      </DialogHeader>
      <div className="flex max-w-full flex-wrap items-center gap-2">
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
  previewFirst = false,
}: {
  editor: React.ReactNode;
  /** Optional right column; without it the editor gets the full width. */
  preview?: React.ReactNode;
  /**
   * Put the preview first and give it the larger share.
   *
   * An author is filling in fields and glancing at the result; a reviewer is
   * judging the result and glancing at the fields. The approval desk reads
   * better with those weights reversed.
   */
  previewFirst?: boolean;
}) {
  if (preview && previewFirst) {
    return (
      <div className="grid min-h-0 min-w-0 gap-5 overflow-y-auto overscroll-contain xl:grid-cols-[minmax(30rem,1.3fr)_minmax(20rem,0.7fr)]">
        <div className="min-w-0 py-1">{preview}</div>
        <aside className="min-w-0 py-1 xl:sticky xl:top-0 xl:self-start">{editor}</aside>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "min-h-0 min-w-0 overflow-y-auto overscroll-contain",
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

/**
 * Desktop only. The phone preview beside it has been withdrawn, so there is no
 * width to switch between; `ViewportFrame` owns the one that remains.
 */
export function WorkspacePreviewFrame({
  title,
  description,
  contexts,
  context,
  onContextChange,
  footnote = "Preview only. Approval, targeting, schedule, ranking, and page context determine actual visibility.",
  children,
}: {
  title: string;
  description: string;
  contexts?: readonly { value: string; label: string }[];
  context?: string;
  onContextChange?: (value: string) => void;
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
        </div>
      </div>
      <div className="rounded-xl border border-border bg-white p-3">
        <ViewportFrame>{children}</ViewportFrame>
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
        <span className="font-medium text-text-primary">Desktop · {DESKTOP_VIEWPORT_WIDTH}px</span>
        <span aria-hidden>·</span>
        <span>{footnote}</span>
      </p>
    </section>
  );
}
