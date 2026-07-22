// Notifications client for the authenticated dashboard.
//
// Calls /api/v1/notifications through the typed fetch wrapper in
// lib/api/client.ts. Wire shapes come from the generated contract; this maps
// them to the camelCase shape the UI consumes (same pattern as lib/site-visits.ts).

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];

export type NotificationType = Schemas["NotificationType"];

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

function mapNotification(raw: Schemas["NotificationRead"]): AppNotification {
  return {
    id: raw.id,
    type: raw.type,
    title: raw.title,
    body: raw.body,
    href: raw.href,
    readAt: raw.read_at,
    createdAt: raw.created_at,
  };
}

export async function getNotifications(): Promise<ApiResponse<AppNotification[]>> {
  const res = await apiRequest<Schemas["NotificationListResponse"]>("/api/v1/notifications");
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.notifications.map(mapNotification) };
}

export async function getUnreadCount(): Promise<ApiResponse<number>> {
  const res = await apiRequest<Schemas["UnreadCountResponse"]>(
    "/api/v1/notifications/unread-count",
  );
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.count };
}

export async function markNotificationRead(id: string): Promise<ApiResponse<AppNotification>> {
  const res = await apiRequest<Schemas["NotificationRead"]>(
    `/api/v1/notifications/${id}/read`,
    { method: "PATCH" },
  );
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: mapNotification(res.data) };
}

export async function markAllNotificationsRead(): Promise<ApiResponse<null>> {
  const res = await apiRequest<null>("/api/v1/notifications/read-all", { method: "POST" });
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: null };
}
