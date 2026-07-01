import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names with Tailwind-aware conflict resolution.
 * Used by shadcn/ui primitives and app components.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
