"use client";

import * as React from "react";

import { getAdminProperties, type AdminProperty } from "@/lib/properties-api";
import { listSubmissions, type Submission } from "@/lib/property-submissions-api";

/**
 * One published listing: the approved submission plus its catalogue row.
 *
 * Neither half is enough on its own. `SubmissionRead` carries the id every
 * write goes through (edit, delete, RERA) but not whether the listing is live;
 * `PropertyRead` carries `active` but has no route back to the submission. The
 * join is `submission.approved_property_id === property.id`, done here rather
 * than server-side so no API contract has to change.
 */
export type PublishedListing = {
  submission: Submission;
  property: AdminProperty | null;
};

export function usePublishedListings() {
  const [items, setItems] = React.useState<PublishedListing[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const [submissionsRes, propertiesRes] = await Promise.all([
      listSubmissions("approved"),
      getAdminProperties(),
    ]);
    setLoading(false);
    if (!submissionsRes.ok) {
      setError(submissionsRes.error);
      return;
    }
    if (!propertiesRes.ok) {
      setError(propertiesRes.error);
      return;
    }
    const byId = new Map(propertiesRes.data.map((property) => [property.id, property]));
    setItems(
      submissionsRes.data.map((submission) => ({
        submission,
        // Null only if the catalogue row is gone from under an approved
        // submission — the row still lists, with its publish control disabled.
        property: submission.approved_property_id
          ? (byId.get(submission.approved_property_id) ?? null)
          : null,
      })),
    );
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, error, reload: load };
}
