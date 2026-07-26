"use client";

import * as React from "react";

import {
  listAdminEmployees,
  listAdminTasks,
  type AdminEmployee,
  type AdminTask,
} from "@/lib/admin-api";

// Fetches the unassigned-task queue plus the active-employee list (for the
// assign dialog's picker) in parallel. Mirrors features/admin/use-agent-queue.ts's
// fetch/reload triad, extended with a second data source that doesn't need its
// own reload (the employee roster doesn't change mid-session).
export function useAdminTasksQueue() {
  const [tasks, setTasks] = React.useState<AdminTask[]>([]);
  const [employees, setEmployees] = React.useState<AdminEmployee[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const [tasksRes, employeesRes] = await Promise.all([
      listAdminTasks("unassigned"),
      listAdminEmployees(),
    ]);
    if (tasksRes.ok) setTasks(tasksRes.data);
    else setError(tasksRes.error);
    if (employeesRes.ok) setEmployees(employeesRes.data);
    else if (tasksRes.ok) setError(employeesRes.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { tasks, employees, loading, error, reload: load };
}
