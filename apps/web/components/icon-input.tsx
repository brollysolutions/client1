"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Input with a muted leading icon, same absolute-positioned technique as
// password-field.tsx. Shared by the public forms (agent application, contact)
// so both keep one field idiom: h-12, rounded-lg, icon in the left padding.
type IconInputProps = React.ComponentProps<typeof Input> & { icon: LucideIcon };

export function IconInput({ icon: Icon, className, ...props }: IconInputProps) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground"
      >
        <Icon className="h-4 w-4" />
      </span>
      <Input
        className={cn("h-12 rounded-lg pl-9 text-base", className)}
        {...props}
      />
    </div>
  );
}
