import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];
export type PersonalizationPreference = Schemas["PersonalizationPreferenceRead"];
export type AuthenticatedPlacement = Schemas["AuthenticatedPlacementResponse"];
export type AuthenticatedBanner = Schemas["AuthenticatedBannerRead"];
export type AuthenticatedOffer = Schemas["AuthenticatedOfferRead"];

export function getPersonalizationPreference(): Promise<ApiResponse<PersonalizationPreference>> {
  return apiRequest<PersonalizationPreference>("/api/v1/personalization/preferences");
}

export function setPersonalizationPreference(
  personalizationEnabled: boolean,
): Promise<ApiResponse<PersonalizationPreference>> {
  return apiRequest<PersonalizationPreference>("/api/v1/personalization/preferences", {
    method: "PATCH",
    body: { personalization_enabled: personalizationEnabled },
  });
}

export function capturePersonalizationLocation(
  latitude: number,
  longitude: number,
): Promise<ApiResponse<PersonalizationPreference>> {
  return apiRequest<PersonalizationPreference>("/api/v1/personalization/location", {
    method: "PUT",
    body: { latitude, longitude },
  });
}

export function revokePersonalizationLocation(): Promise<ApiResponse<PersonalizationPreference>> {
  return apiRequest<PersonalizationPreference>("/api/v1/personalization/location", {
    method: "DELETE",
  });
}

export function listAuthenticatedPlacements(
  businessLine: "loans" | "real_estate",
): Promise<ApiResponse<AuthenticatedPlacement>> {
  return apiRequest<AuthenticatedPlacement>(
    `/api/v1/personalization/placements?business_line=${businessLine}`,
  );
}
