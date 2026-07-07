"use client";

import * as React from "react";
import { Check, Eye, EyeOff, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordFieldProps = React.ComponentProps<typeof Input> & {
  // Optional inline validity indicator shown inside the field (left of the eye
  // toggle): a green check when "valid", a red cross when "invalid". Undefined
  // renders no indicator (e.g. the login password, which isn't validated live).
  status?: "valid" | "invalid";
};

// Password input with a show/hide toggle plus an optional in-field validity icon.
// Forwards all Input props (id, value, onChange, aria-*, disabled …).
export function PasswordField({ className, status, ...props }: PasswordFieldProps) {
  const [show, setShow] = React.useState(false);

  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        className={cn(
          "pr-10",
          status && "pr-16",
          status === "valid" &&
            "border-success focus-visible:border-success focus-visible:ring-success/40",
          className,
        )}
        aria-invalid={status === "invalid" ? true : props["aria-invalid"]}
        {...props}
      />

      {status && (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 right-10 flex items-center",
            status === "valid" ? "text-success" : "text-destructive",
          )}
        >
          {status === "valid" ? (
            <Check className="h-4 w-4" />
          ) : (
            <X className="h-4 w-4" />
          )}
        </span>
      )}

      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
