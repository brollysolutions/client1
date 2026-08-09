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
export type TaskDocument = Schemas["TaskDocumentRead"];
export type TaskDocumentPresignRequest = Schemas["TaskDocumentPresignRequest"];
export type TaskDocumentPresignResponse = Schemas["TaskDocumentPresignResponse"];
export type TaskDocumentCreate = Schemas["TaskDocumentCreate"];
export type TaskFeedbackMedia = Schemas["TaskFeedbackMediaRead"];
export type TaskFeedbackMediaCreate = Schemas["TaskFeedbackMediaCreate"];
export type TaskFeedbackMediaPresignRequest = Schemas["TaskFeedbackMediaPresignRequest"];
export type TaskFeedbackMediaPresignResponse = Schemas["TaskFeedbackMediaPresignResponse"];
export type ContactShareLink = Schemas["ContactShareLinkRead"];
export type DocType = TaskDocumentCreate["doc_type"];
export type VehicleArrangement = Schemas["VehicleArrangementStaffRead"];
export type VehicleArrangementEmployeeUpdate = Schemas["VehicleArrangementEmployeeUpdate"];
export type VehicleArrangementStatus = Schemas["VehicleArrangementStatus"];

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

export async function listEmployeeVehicleArrangements(
  statusFilter?: VehicleArrangementStatus,
): Promise<ApiResponse<VehicleArrangement[]>> {
  const query = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : "";
  return apiRequest<VehicleArrangement[]>(`/api/v1/employee/vehicle-arrangements${query}`);
}

export async function updateEmployeeVehicleArrangement(
  arrangementId: string,
  payload: VehicleArrangementEmployeeUpdate,
): Promise<ApiResponse<VehicleArrangement>> {
  return apiRequest<VehicleArrangement>(
    `/api/v1/employee/vehicle-arrangements/${arrangementId}`,
    { method: "PATCH", body: payload },
  );
}

export async function createTaskContactShareLink(
  taskId: string,
): Promise<ApiResponse<ContactShareLink>> {
  return apiRequest<ContactShareLink>(`/api/v1/employee/tasks/${taskId}/contact-share-links`, {
    method: "POST",
  });
}

export async function revokeTaskContactShareLink(
  linkId: string,
): Promise<ApiResponse<undefined>> {
  return apiRequest<undefined>(`/api/v1/employee/contact-share-links/${linkId}`, {
    method: "DELETE",
  });
}

export async function presignTaskDocument(
  taskId: string,
  payload: TaskDocumentPresignRequest,
): Promise<ApiResponse<TaskDocumentPresignResponse>> {
  return apiRequest<TaskDocumentPresignResponse>(
    `/api/v1/employee/tasks/${taskId}/documents/presign`,
    { method: "POST", body: payload },
  );
}

export async function confirmTaskDocument(
  taskId: string,
  payload: TaskDocumentCreate,
): Promise<ApiResponse<TaskDocument>> {
  return apiRequest<TaskDocument>(`/api/v1/employee/tasks/${taskId}/documents`, {
    method: "POST",
    body: payload,
  });
}

export async function listTaskDocuments(taskId: string): Promise<ApiResponse<TaskDocument[]>> {
  return apiRequest<TaskDocument[]>(`/api/v1/employee/tasks/${taskId}/documents`);
}

export async function deleteTaskDocument(
  taskId: string,
  documentId: string,
): Promise<ApiResponse<undefined>> {
  return apiRequest<undefined>(`/api/v1/employee/tasks/${taskId}/documents/${documentId}`, {
    method: "DELETE",
  });
}

export async function presignTaskFeedbackMedia(
  taskId: string,
  payload: TaskFeedbackMediaPresignRequest,
): Promise<ApiResponse<TaskFeedbackMediaPresignResponse>> {
  return apiRequest<TaskFeedbackMediaPresignResponse>(
    `/api/v1/employee/tasks/${taskId}/feedback-media/presign`,
    { method: "POST", body: payload },
  );
}

export async function confirmTaskFeedbackMedia(
  taskId: string,
  payload: TaskFeedbackMediaCreate,
): Promise<ApiResponse<TaskFeedbackMedia>> {
  return apiRequest<TaskFeedbackMedia>(`/api/v1/employee/tasks/${taskId}/feedback-media`, {
    method: "POST",
    body: payload,
  });
}

export async function listTaskFeedbackMedia(
  taskId: string,
): Promise<ApiResponse<TaskFeedbackMedia[]>> {
  return apiRequest<TaskFeedbackMedia[]>(`/api/v1/employee/tasks/${taskId}/feedback-media`);
}

export async function deleteTaskFeedbackMedia(
  taskId: string,
  mediaId: string,
): Promise<ApiResponse<undefined>> {
  return apiRequest<undefined>(
    `/api/v1/employee/tasks/${taskId}/feedback-media/${mediaId}`,
    { method: "DELETE" },
  );
}

// Direct-to-storage PUT against the presigned URL — a different host than the
// API's BASE_URL, so this deliberately bypasses apiRequest (no auth header,
// no JSON body, no auto-refresh retry; storage doesn't know about any of that).
export async function uploadFileToPresignedUrl(
  uploadUrl: string,
  file: File,
): Promise<{ ok: boolean }> {
  try {
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}
