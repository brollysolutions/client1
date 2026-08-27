"use client";

/**
 * Compatibility shim.
 *
 * The workspace dialog, its layout/preview frame and the filter bar all began
 * here, but they are no longer CMS-specific — the admin queues adopted the same
 * floating window and the same filter bar, and leaving the canonical copies
 * under `features/sub-admin/` would have left Admin importing across roles.
 * They now live in `features/dashboard/`.
 *
 * The ten Sub Admin call sites keep the old names through this file until the
 * Sub Admin surfaces are rebuilt on `DataTable`, at which point this shim goes
 * away with them.
 */

import type { ReactNode } from "react";

import {
  FilterBar,
  type FilterBarValue,
  type FilterOption,
  DEFAULT_LINE_OPTIONS,
} from "@/features/dashboard/filter-bar";
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
export type CmsFilterValue = FilterBarValue;

/**
 * The CMS bar always required `statusOptions` and always showed the
 * authorization note; the shared bar makes both optional. Kept as a wrapper
 * rather than an alias so the sub-admin call sites do not have to change yet.
 */
export function CmsFilterBar({
  value,
  onChange,
  statusOptions,
  kindOptions,
  kindLabel,
  lineOptions = DEFAULT_LINE_OPTIONS,
  searchLabel,
  showStatus = true,
}: {
  value: CmsFilterValue;
  onChange: (value: CmsFilterValue) => void;
  statusOptions: readonly FilterOption[];
  kindOptions?: readonly FilterOption[];
  kindLabel?: string;
  lineOptions?: readonly FilterOption[];
  searchLabel: string;
  showStatus?: boolean;
}): ReactNode {
  return (
    <FilterBar
      value={value}
      onChange={onChange}
      searchLabel={searchLabel}
      statusOptions={statusOptions}
      kindOptions={kindOptions}
      kindLabel={kindLabel}
      lineOptions={lineOptions}
      showStatus={showStatus}
      note="Filters apply to the records already loaded for your authorized role."
    />
  );
}
