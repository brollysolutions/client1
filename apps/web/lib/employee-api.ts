// Employee client — assigned-task list/detail, status/outcome update, home.
//
// Thin typed wrapper over /api/v1/employee via lib/api/client.ts, same pattern
// as lib/telecaller-api.ts. Wire shape (snake_case, generated) is surfaced as-is.

import type { components } from "@contracts/generated/schema";

import { apiRequest, type ApiResponse } from "@/lib/api/client";

type Schemas = components["schemas"];
export type EmployeeTask = Schemas["EmployeeTaskRead"];
export type EmployeeTaskUpdate = Schemas["EmployeeTaskUpdate"];
export type EmployeeHome = Schemas["EmployeeHomeResponse"];

export async function listEmployeeTasks(
  statusFilter?: string,
  taskTypeFilter?: string,
): Promise<ApiResponse<EmployeeTask[]>> {
  const params = new URLSearchParams();
  if (statusFilter) params.set("status_filter", statusFilter);
  if (taskTypeFilter) params.set("task_type_filter", taskTypeFilter);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<EmployeeTask[]>(`/api/v1/employee/tasks${query}`);
}

export async function getEmployeeTask(taskId: string): Promise<ApiResponse<EmployeeTask>> {
  return apiRequest<EmployeeTask>(`/api/v1/employee/tasks/${taskId}`);
}

export async function updateEmployeeTask(
  taskId: string,
  payload: EmployeeTaskUpdate,
): Promise<ApiResponse<EmployeeTask>> {
  return apiRequest<EmployeeTask>(`/api/v1/employee/tasks/${taskId}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function getEmployeeHome(): Promise<ApiResponse<EmployeeHome>> {
  return apiRequest<EmployeeHome>("/api/v1/employee/home");
}
