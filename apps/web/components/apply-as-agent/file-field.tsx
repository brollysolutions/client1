"use client";

import * as React from "react";
import { type LucideIcon, Paperclip, X } from "lucide-react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Dependency-free KYC file picker. The native <input type="file"> stays
// mounted but sr-only + tabIndex=-1 (proxy target only); the visible trigger
// is a real <button> so there is exactly one focusable/tabbable control and
// one accessible name, with <Label htmlFor> pointing at the button (labels
// can target any labelable element, buttons included, per the HTML spec).
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
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function FileField({
  id,
  label,
  icon: Icon,
  value,
  onChange,
  accept = DEFAULT_ACCEPT,
  maxBytes = DEFAULT_MAX_BYTES,
  hint = "JPG, PNG or PDF, up to 5 MB",
  error,
  disabled,
}: FileFieldProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [localError, setLocalError] = React.useState<string | undefined>();

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

    if (!acceptedTypes.includes(file.type)) {
      setLocalError("Unsupported file type. Use JPG, PNG or PDF.");
      onChange(null);
      return;
    }
    if (file.size > maxBytes) {
      setLocalError(`File is too large. Max ${formatBytes(maxBytes)}.`);
      onChange(null);
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

  const displayError = error ?? localError;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = displayError ? errorId : hint ? hintId : undefined;

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>

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

      {value ? (
        <div
          className={cn(
            "flex h-12 items-center gap-3 rounded-lg border px-3.5",
            displayError ? "border-destructive" : "border-[var(--nav-border)]",
          )}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt=""
              className="h-8 w-8 shrink-0 rounded object-cover"
            />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[var(--nav-tint)] text-[var(--nav-primary)]">
              <Paperclip className="h-4 w-4" aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {value.name}
            </p>
            <p className="text-xs text-text-secondary">
              {formatBytes(value.size)}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            aria-label={`Remove ${label}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--nav-tint)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          id={id}
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          aria-describedby={describedBy}
          className={cn(
            "flex h-12 w-full items-center gap-3 rounded-lg border border-dashed px-3.5 text-left text-sm text-text-secondary transition-colors hover:bg-[var(--nav-tint)]/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
            displayError ? "border-destructive" : "border-[var(--nav-border)]",
          )}
        >
          <Icon className="h-4 w-4 shrink-0 text-[var(--nav-primary)]" aria-hidden />
          <span>Choose file</span>
        </button>
      )}

      {displayError ? (
        <p id={errorId} className="text-sm text-destructive">
          {displayError}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-text-secondary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
