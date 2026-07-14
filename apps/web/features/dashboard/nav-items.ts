import { FilePlus2, FolderClosed, LayoutGrid } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

// Slim loans-workspace rail. Warm-gray chrome, icon-only with tooltips; no logo
// or wordmark. The active item takes the current line accent (green for loans),
// set in app-sidebar. The line switcher + account menu live in the top bar.
export const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "Home", href: "/dashboard", icon: LayoutGrid },
  { key: "apply", label: "Apply for a loan", href: "/dashboard/apply", icon: FilePlus2 },
  { key: "documents", label: "Documents", href: "/dashboard/documents", icon: FolderClosed },
];
