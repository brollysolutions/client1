import * as React from "react";

import { avatarColorIndex, avatarInitial } from "@/lib/avatar";
import { cn } from "@/lib/utils";

// Literal class list so Tailwind's JIT sees every bg-avatar-N utility (a
// computed `bg-avatar-${n}` string would not be scanned). Order matches the
// --color-avatar-N tokens in app/globals.css; index is 1-based from avatar.ts.
const AVATAR_BG = [
  "bg-avatar-1",
  "bg-avatar-2",
  "bg-avatar-3",
  "bg-avatar-4",
  "bg-avatar-5",
  "bg-avatar-6",
  "bg-avatar-7",
  "bg-avatar-8",
] as const;

const SIZES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
} as const;

type UserAvatarProps = {
  name?: string | null;
  email?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
};

// Google-style letter tile: the person's initial on a deterministic colour.
// The full name is the accessible label; the visible glyph is decorative.
export function UserAvatar({ name, email, size = "md", className }: UserAvatarProps) {
  const label = (name ?? "").trim() || (email ?? "").trim() || "User";
  const initial = avatarInitial(name, email);
  const bg = AVATAR_BG[avatarColorIndex(label) - 1];

  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white",
        SIZES[size],
        bg,
        className,
      )}
    >
      <span aria-hidden="true">{initial}</span>
    </span>
  );
}
