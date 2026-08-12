"use client";

import * as React from "react";

import {
  listAdminTasks,
  type AdminTask,
} from "@/lib/admin-api";

// Fetches read-only lead, Telecaller, and Employee field-work relationships.
export function useAdminTasksQueue() {
  const [tasks, setTasks] = React.useState<AdminTask[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listAdminTasks();
    if (result.ok) setTasks(result.data);
    else setError(result.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { tasks, loading, error, reload: load };
}
