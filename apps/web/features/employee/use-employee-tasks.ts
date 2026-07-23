"use client";

import * as React from "react";

import { listEmployeeTasks, type EmployeeTask } from "@/lib/employee-api";

// Fetches the employee's assigned-task list. Mirrors
// features/telecaller/use-telecaller-leads.ts.
export function useEmployeeTasks(statusFilter?: string, taskTypeFilter?: string) {
  const [items, setItems] = React.useState<EmployeeTask[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listEmployeeTasks(statusFilter, taskTypeFilter);
    if (res.ok) setItems(res.data);
    else setError(res.error);
    setLoading(false);
  }, [statusFilter, taskTypeFilter]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { items, loading, error, reload: load };
}
