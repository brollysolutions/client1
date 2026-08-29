"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * In-app replacement for `window.confirm`.
 *
 * A native confirm renders as browser chrome pinned to the top of the window,
 * detached from the dialog or page that triggered it. Inside a full-screen
 * workspace that reads as a browser malfunction rather than a question about
 * the campaign, and it cannot be styled, labelled, or made to say what the
 * destructive action actually does.
 *
 * Usage keeps the imperative shape that `window.confirm` had, so call sites
 * stay linear:
 *
 *     const { confirm, confirmDialog } = useConfirm();
 *     if (!(await confirm({ title: "Delete this draft?" }))) return;
 *     // ... and render {confirmDialog} once in the tree
 */
export type ConfirmOptions = {
  title: string;
  description?: string;
  /** Defaults to "Continue", or "Delete" when `destructive` is set. */
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export function useConfirm() {
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null);
  const resolveRef = React.useRef<((confirmed: boolean) => void) | null>(null);

  const settle = React.useCallback((confirmed: boolean) => {
    // Resolve before clearing so a caller awaiting the promise is never left
    // hanging if the component unmounts on close.
    resolveRef.current?.(confirmed);
    resolveRef.current = null;
    setOptions(null);
  }, []);

  const confirm = React.useCallback((next: ConfirmOptions) => {
    // A second request while one is open would strand the first promise.
    resolveRef.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  React.useEffect(() => () => resolveRef.current?.(false), []);

  const confirmDialog = (
    <ConfirmDialog options={options} onResolve={settle} />
  );

  return { confirm, confirmDialog };
}

function ConfirmDialog({
  options,
  onResolve,
}: {
  options: ConfirmOptions | null;
  onResolve: (confirmed: boolean) => void;
}) {
  // Keep the last options while the close animation runs so the copy does not
  // blank out mid-dismiss.
  const [rendered, setRendered] = React.useState<ConfirmOptions | null>(options);
  React.useEffect(() => {
    if (options) setRendered(options);
  }, [options]);

  const destructive = rendered?.destructive ?? false;
  return (
    <Dialog open={options !== null} onOpenChange={(open) => (open ? undefined : onResolve(false))}>
      <DialogContent showCloseButton={false} className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {destructive ? (
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-red-50 text-red-600">
                <AlertTriangle className="h-4 w-4" aria-hidden />
              </span>
            ) : null}
            {rendered?.title ?? ""}
          </DialogTitle>
          {rendered?.description ? (
            <DialogDescription>{rendered.description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onResolve(false)}>
            {rendered?.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            autoFocus
            onClick={() => onResolve(true)}
          >
            {rendered?.confirmLabel ?? (destructive ? "Delete" : "Continue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
