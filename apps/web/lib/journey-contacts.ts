import type { components } from "@contracts/generated/schema";
import { apiRequest } from "@/lib/api/client";
export type JourneyContacts = components["schemas"]["JourneyContactsRead"];
export function getJourneyContacts(line: "loans" | "real_estate") {
  return apiRequest<JourneyContacts>(`/api/v1/client/lead-details/${line}/contacts`);
}
