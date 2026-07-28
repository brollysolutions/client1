"use client";

import * as React from "react";

import { listAdminLoanTypes, type AdminLoanType } from "@/lib/loan-config-api";

export function useLoanTypes() {
  const [items, setItems] = React.useState<AdminLoanType[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listAdminLoanTypes();
    if (res.ok) setItems(res.data);
    else setError(res.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, error, reload: load };
}
