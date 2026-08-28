"use client";

/**
 * Compatibility shim.
 *
 * The workspace dialog and its layout/preview frame began
 * here, but they are no longer CMS-specific — the admin queues adopted the same
 * floating window and the same filter bar, and leaving the canonical copies
 * under `features/sub-admin/` would have left Admin importing across roles.
 * They now live in `features/dashboard/`.
 *
 * Sub Admin workspace call sites retain their original names here while the
 * canonical role-neutral implementation lives under `features/dashboard/`.
 */
import {
  WORKSPACE_DIALOG_CLASS,
  WorkspaceDialogHeader,
  WorkspaceLayout,
  WorkspacePreviewFrame,
  type PreviewDevice,
} from "@/features/dashboard/workspace-dialog";

export const CMS_WORKSPACE_DIALOG_CLASS = WORKSPACE_DIALOG_CLASS;
export const CmsWorkspaceHeader = WorkspaceDialogHeader;
export const CmsWorkspaceLayout = WorkspaceLayout;
export const CmsPreviewFrame = WorkspacePreviewFrame;
export type { PreviewDevice };
