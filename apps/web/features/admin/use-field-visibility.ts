"use client";

import * as React from "react";

import {
  listFieldVisibility,
  updateFieldVisibility,
  type FieldVisibilityEntry,
  type FieldVisibilityUpdate,
} from "@/lib/field-visibility-api";

export function useFieldVisibility() {
  const [entries, setEntries] = React.useState<FieldVisibilityEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const response = await listFieldVisibility();
    if (response.ok) setEntries(response.data);
    else setError(response.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const update = React.useCallback(async (payload: FieldVisibilityUpdate) => {
    const response = await updateFieldVisibility(payload);
    if (response.ok) {
      setEntries((current) =>
        current.map((entry) =>
          entry.target_role === response.data.target_role &&
          entry.entity === response.data.entity &&
          entry.field_key === response.data.field_key
            ? response.data
            : entry,
        ),
      );
    }
    return response;
  }, []);

  return { entries, loading, error, reload, update };
}

