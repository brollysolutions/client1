"use client";

import * as React from "react";

import { getBankAvailabilityMatrix, type AvailabilityMatrix } from "@/lib/loan-config-api";

export function useBankAvailability() {
  const [matrix, setMatrix] = React.useState<AvailabilityMatrix | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getBankAvailabilityMatrix();
    if (res.ok) setMatrix(res.data);
    else setError(res.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { matrix, loading, error, reload: load };
}
