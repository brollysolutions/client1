import { Bell, CircleUser, FilePlus2, FolderClosed, Headset, House, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  // Loans-only surfaces. Hidden when the workspace is on the real-estate line so
  // a loans feature is never offered under the real-estate accent.
  loansOnly?: boolean;
};

// Slim workspace rail. Near-white chrome, icon-only with tooltips on desktop.
// Icons are gray and turn blue on hover; the active item shows a blue icon plus
// a left indicator bar (set in app-sidebar). Home + the identity-level items
// (Transactions/Support/Notifications) show for both lines; Apply and Documents
// are loans-only. The line switcher + account menu live in the top bar.
export const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "Home", href: "/dashboard", icon: House },
  { key: "apply", label: "Apply for a loan", href: "/dashboard/apply", icon: FilePlus2, loansOnly: true },
  { key: "documents", label: "Documents", href: "/dashboard/documents", icon: FolderClosed, loansOnly: true },
  { key: "transactions", label: "Transactions", href: "/dashboard/transactions", icon: Wallet },
  { key: "support", label: "Support", href: "/dashboard/support", icon: Headset },
  { key: "notifications", label: "Notifications", href: "/dashboard/notifications", icon: Bell },
  { key: "profile", label: "Profile", href: "/dashboard/settings", icon: CircleUser },
];
