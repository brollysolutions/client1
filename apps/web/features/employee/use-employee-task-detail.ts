"use client";

import * as React from "react";

import type { ApiResponse } from "@/lib/api/client";
import {
  getEmployeeTask,
  updateEmployeeTask,
  type EmployeeTask,
  type EmployeeTaskUpdate,
} from "@/lib/employee-api";

type Status = "loading" | "ready" | "error";

export function useEmployeeTaskDetail(taskId: string) {
  const [task, setTask] = React.useState<EmployeeTask | null>(null);
  const [status, setStatus] = React.useState<Status>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const retry = React.useCallback(() => {
    setStatus("loading");
    setError(null);
    setErrorStatus(null);
    setReloadKey((k) => k + 1);
  }, []);

  React.useEffect(() => {
    let active = true;
    const run = async () => {
      const res = await getEmployeeTask(taskId);
      if (!active) return;
      if (res.ok) {
        setTask(res.data);
        setStatus("ready");
        return;
      }
      setError(res.error);
      setErrorStatus(res.status);
      setStatus("error");
    };
    void run();
    return () => {
      active = false;
    };
  }, [taskId, reloadKey]);

  async function updateTask(payload: EmployeeTaskUpdate): Promise<ApiResponse<unknown>> {
    const res = await updateEmployeeTask(taskId, payload);
    if (res.ok) retry();
    return res;
  }

  return { task, status, error, errorStatus, retry, updateTask };
}
