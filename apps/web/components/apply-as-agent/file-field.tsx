"use client";

import * as React from "react";
import { FileText, Plus, UploadCloud, X, type LucideIcon } from "lucide-react";

import { CLOSE_BUTTON_CLASS } from "@/components/ui/close-button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Square dashed KYC upload tile. The native <input type="file"> stays mounted
// but sr-only + tabIndex=-1 (proxy target only); the visible tile is a real
// <button> so there is exactly one focusable/tabbable control and one
// accessible name, with <Label htmlFor> pointing at the button (labels can
// target any labelable element, buttons included, per the HTML spec). The
// remove control is a sibling positioned over the tile, never a nested button.
//
// Image uploads preview inside the tile (object-cover fills the square, name +
// size on a bottom scrim); PDFs get a document glyph + name since there is no
// cheap thumbnail. Clicking a filled tile replaces the file. Drag and drop
// works on the tile itself; the dashed border doubles as the drop target.
export type FileFieldProps = {
  id: string;
  label: string;
  icon: LucideIcon;
  value: File | null;
  onChange: (file: File | null) => void;
  accept?: string;
  maxBytes?: number;
  hint?: string;
  error?: string;
  disabled?: boolean;
};

const DEFAULT_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  // Whole megabytes stay whole ("5 MB", not "5.0 MB").
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

export function FileField({
  id,
  label,
  icon: Icon,
  value,
  onChange,
  accept = DEFAULT_ACCEPT,
  maxBytes = DEFAULT_MAX_BYTES,
  hint = "JPG, PNG or PDF",
  error,
  disabled,
}: FileFieldProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [localError, setLocalError] = React.useState<string | undefined>();
  const [dragging, setDragging] = React.useState(false);

  React.useEffect(() => {
    if (!value || !value.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const acceptedTypes = React.useMemo(
    () => accept.split(",").map((entry) => entry.trim()),
    [accept],
  );

  function handleFiles(fileList: FileList | null) {
    const file = fileList?.[0] ?? null;
    // Reset so re-picking the same file (e.g. after Remove) still fires onChange.
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;

    // A rejected pick keeps the previously accepted file (if any): losing a
    // valid Aadhaar scan because a replacement was 6 MB would force the user
    // to re-locate the original for no reason. Only the error is surfaced.
    if (!acceptedTypes.includes(file.type)) {
      setLocalError(`Unsupported file type. Use ${hint}.`);
      return;
    }
    if (file.size > maxBytes) {
      setLocalError(`File is too large. Max ${formatBytes(maxBytes)}.`);
      return;
    }
    setLocalError(undefined);
    onChange(file);
  }

  function handleRemove() {
    setLocalError(undefined);
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    handleFiles(event.dataTransfer.files);
  }

  const displayError = error ?? localError;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  // aria-label replaces the button's inner text as its accessible name, so
  // the format/size hint must be re-attached via aria-describedby or screen
  // readers never hear it. The hint node only exists in the empty state.
  const describedBy = displayError ? errorId : !value ? hintId : undefined;

  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id} className="justify-self-center text-sm">
        {label}
      </Label>

      <input
        ref={inputRef}
        id={`${id}-input`}
        type="file"
        accept={accept}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => handleFiles(event.target.files)}
        className="sr-only"
      />

      <div className="relative">
        <button
          type="button"
          id={id}
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          aria-label={value ? `Replace ${label}` : `Upload ${label}`}
          aria-describedby={describedBy}
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={(event) => {
            // dragleave also fires when the pointer crosses onto a child
            // (the preview img/spans); only clear when truly leaving the tile.
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setDragging(false);
            }
          }}
          onDrop={handleDrop}
          className={cn(
            "group relative flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed p-3 text-center transition-colors",
            "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--nav-primary)]/50",
            "disabled:pointer-events-none disabled:cursor-default disabled:opacity-50",
            displayError
              ? "border-destructive"
              : dragging
                ? "border-[var(--nav-primary)] bg-[var(--nav-tint)]/60"
                : value
                  ? "border-transparent"
                  : "border-[var(--nav-border)] bg-surface/60 hover:border-[var(--nav-primary)]/50 hover:bg-[var(--nav-tint)]/40",
          )}
        >
          {value ? (
            previewUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full rounded-[10px] object-cover"
                />
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/70 via-black/40 to-transparent px-2.5 pb-2 pt-6 text-left"
                >
                  <span className="truncate text-xs font-medium text-white">
                    {value.name}
                  </span>
                  <span className="text-[11px] text-white/80">
                    {formatBytes(value.size)}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-[10px] ring-1 ring-inset ring-black/10 transition group-hover:ring-[var(--nav-primary)]/60"
                />
              </>
            ) : (
              <span className="flex flex-col items-center gap-2">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--nav-tint)] text-[var(--nav-primary)]">
                  <FileText className="h-5 w-5" aria-hidden />
                </span>
                <span className="max-w-full truncate px-1 text-xs font-medium text-foreground">
                  {value.name}
                </span>
                <span className="text-[11px] text-text-secondary">
                  {formatBytes(value.size)}
                </span>
              </span>
            )
          ) : (
            <>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--nav-tint)] text-[var(--nav-primary)] transition-transform group-hover:scale-105">
                {dragging ? (
                  <UploadCloud className="h-5 w-5" aria-hidden />
                ) : (
                  <Icon className="h-5 w-5" aria-hidden />
                )}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--nav-primary)]">
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Upload
              </span>
              <span
                id={hintId}
                className="text-[11px] leading-tight text-text-secondary"
              >
                {hint}, up to {formatBytes(maxBytes)}
              </span>
            </>
          )}
        </button>

        {value && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            aria-label={`Remove ${label}`}
            className={cn("absolute right-2 top-2", CLOSE_BUTTON_CLASS)}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {displayError && (
        <p id={errorId} className="text-center text-xs text-destructive">
          {displayError}
        </p>
      )}
    </div>
  );
}
