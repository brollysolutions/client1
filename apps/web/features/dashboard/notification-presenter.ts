import {
  CalendarCheck,
  CalendarX,
  CarFront,
  ClipboardList,
  Eraser,
  FileCheck2,
  Gift,
  Headset,
  Home,
  Landmark,
  Megaphone,
  PhoneCall,
  ShieldAlert,
  Smartphone,
  Undo2,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import type { NotificationType } from "@/lib/notifications";

export const NOTIFICATION_TYPE_ICON: Record<NotificationType, LucideIcon> = {
  site_visit_requested: CalendarCheck,
  site_visit_cancelled: CalendarX,
  support_ticket_received: Headset,
  support_ticket_resolved: Headset,
  lead_assigned: PhoneCall,
  lead_released: Undo2,
  agent_lead_expired: Undo2,
  task_assigned: ClipboardList,
  loan_status_updated: Landmark,
  property_deal_status_updated: Home,
  referral_converted: Gift,
  document_review_updated: FileCheck2,
  admin_payout_reviewed: Wallet,
  admin_account_action: ShieldAlert,
  admin_retention_purged: Eraser,
  admin_broadcast: Megaphone,
  mobile_change_requested: Smartphone,
  mobile_changed: Smartphone,
  mobile_change_rejected: ShieldAlert,
  vehicle_arrangement_updated: CarFront,
};

export function formatNotificationTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diffMinutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
