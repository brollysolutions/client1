// Bookmarks client for the authenticated real-estate client dashboard.
//
// Calls /api/v1/bookmarks through the typed fetch wrapper in lib/api/client.ts.
// Wire shapes come from the generated contract; this maps them to the
// camelCase shape the UI consumes (same pattern as lib/site-visits.ts).

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];

export type BookmarkedProperty = {
  id: string;
  propertyRef: string;
  title: string | null;
  locality: string | null;
  city: string | null;
  createdAt: string;
};

function mapBookmark(raw: Schemas["BookmarkRead"]): BookmarkedProperty {
  return {
    id: raw.id,
    propertyRef: raw.property_ref,
    title: raw.title,
    locality: raw.locality,
    city: raw.city,
    createdAt: raw.created_at,
  };
}

export async function getBookmarks(): Promise<ApiResponse<BookmarkedProperty[]>> {
  const res = await apiRequest<Schemas["BookmarkListResponse"]>("/api/v1/bookmarks");
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: res.data.bookmarks.map(mapBookmark) };
}

export async function createBookmark(input: {
  propertyRef: string;
  title?: string;
  locality?: string;
  city?: string;
}): Promise<ApiResponse<BookmarkedProperty>> {
  const res = await apiRequest<Schemas["BookmarkRead"]>("/api/v1/bookmarks", {
    method: "POST",
    body: {
      property_ref: input.propertyRef,
      ...(input.title ? { title: input.title } : {}),
      ...(input.locality ? { locality: input.locality } : {}),
      ...(input.city ? { city: input.city } : {}),
    } satisfies Schemas["BookmarkCreate"],
  });
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: mapBookmark(res.data) };
}

export async function deleteBookmark(propertyRef: string): Promise<ApiResponse<null>> {
  const res = await apiRequest<null>(`/api/v1/bookmarks/${encodeURIComponent(propertyRef)}`, {
    method: "DELETE",
  });
  if (!res.ok) return res;
  return { ok: true, status: res.status, data: null };
}
