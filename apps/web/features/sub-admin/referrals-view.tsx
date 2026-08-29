"use client";

import * as React from "react";
import { Gift, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import {
  DashboardHeader,
  DashboardPage,
  DashboardPanel,
  MetricCard,
  MetricGrid,
} from "@/features/dashboard/dashboard-ui";
import { DataTable, DataTablePrimaryCell, type DataColumn } from "@/features/dashboard/data-table";
import { FetchError } from "@/features/dashboard/fetch-error";
import { EMPTY_FILTERS, FilterBar, type FilterBarValue } from "@/features/dashboard/filter-bar";
import { ListEmptyState, ListLoadingState, ListPagination } from "@/features/dashboard/list-states";
import { StatusBadge, type StatusTone } from "@/features/dashboard/status-badge";
import { useFilteredPage } from "@/features/dashboard/use-filtered-page";
import {
  PANEL_DIALOG_CLASS,
  WorkspaceDialogHeader,
} from "@/features/dashboard/workspace-dialog";
import { formatDate, formatPaise } from "@/lib/format";
import {
  deleteReferralBonusConfig,
  updateReferralBonusConfig,
  type ReferralBonusConfig,
  type ReferralPayoutActivity,
} from "@/lib/referral-bonus-api";
import { filterReferralActivity, filterReferralRules } from "./cms-filters";
import { ReferralConfigForm } from "./referral-config-form";
import { useReferralBonus } from "./use-referral-bonus";

const LINE_LABEL: Record<string, string> = {
  loans: "Loans",
  real_estate: "Real Estate",
  both: "Both lines",
};
const RULE_STATUS_OPTIONS = [
  { value: "active", label: "Live" },
  { value: "inactive", label: "Retired" },
] as const;
const ACTIVITY_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "paid", label: "Paid" },
  { value: "failed", label: "Failed" },
] as const;
const ACTIVITY_STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: "Pending", tone: "warning" },
  approved: { label: "Approved", tone: "info" },
  paid: { label: "Paid", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

function ruleSummary(rule: ReferralBonusConfig["rule"]): string {
  const entries = Object.entries(rule);
  if (entries.length === 0) return "No extra conditions";
  return entries.map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`).join(" · ");
}

export function ReferralsView() {
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";
  const { configs, activity, loading, error, reload } = useReferralBonus();
  const [filters, setFilters] = React.useState<FilterBarValue>(EMPTY_FILTERS);
  const [activityFilters, setActivityFilters] = React.useState<FilterBarValue>(EMPTY_FILTERS);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createDirty, setCreateDirty] = React.useState(false);
  const { confirm, confirmDialog } = useConfirm();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ReferralBonusConfig | null>(null);

  const filteredRules = React.useMemo(
    () => filterReferralRules(configs, filters),
    [configs, filters],
  );
  const filteredActivity = React.useMemo(
    () => filterReferralActivity(activity, activityFilters),
    [activity, activityFilters],
  );
  const rulesPage = useFilteredPage(filteredRules, filters);
  const activityPage = useFilteredPage(filteredActivity, activityFilters);

  const toggle = React.useCallback(async (config: ReferralBonusConfig) => {
    setBusyId(config.id);
    const response = await updateReferralBonusConfig(config.id, { active: !config.active });
    setBusyId(null);
    if (!response.ok) {
      toast.error("Could not update rule", { description: response.error });
      return;
    }
    toast.success(response.data.active ? "Rule is live" : "Rule retired");
    void reload();
  }, [reload]);

  const remove = React.useCallback(async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    const response = await deleteReferralBonusConfig(deleteTarget.id);
    setBusyId(null);
    if (!response.ok) {
      toast.error("Could not delete rule", { description: response.error });
      return;
    }
    setDeleteTarget(null);
    toast.success("Unused referral rule deleted");
    void reload();
  }, [deleteTarget, reload]);

  // Synchronous handler: on a dirty close the dialog stays open and the
  // confirmation opens above it.
  function closeCreate(open: boolean) {
    if (open) {
      setCreateOpen(true);
      return;
    }
    if (!createDirty) {
      setCreateOpen(false);
      setCreateDirty(false);
      return;
    }
    void confirm({
      title: "Discard this referral rule?",
      description: "Nothing has been saved yet, so the rule will be lost.",
      confirmLabel: "Discard rule",
      destructive: true,
    }).then((confirmed) => {
      if (!confirmed) return;
      setCreateOpen(false);
      setCreateDirty(false);
    });
  }

  const ruleColumns = React.useMemo<readonly DataColumn<ReferralBonusConfig>[]>(
    () => [
      {
        key: "bonus",
        header: "Bonus",
        render: (config) => (
          <DataTablePrimaryCell
            title={`₹${config.bonus_amount}`}
            subtitle={ruleSummary(config.rule)}
          />
        ),
      },
      {
        key: "line",
        header: "Line scope",
        render: (config) => LINE_LABEL[config.business_line] ?? config.business_line,
      },
      { key: "updated", header: "Updated", render: (config) => formatDate(config.updated_at) },
      {
        key: "state",
        header: "State",
        render: (config) => (
          <div>
            <StatusBadge tone={config.active ? "success" : "neutral"}>
              {config.active ? "Live" : "Retired"}
            </StatusBadge>
            {config.is_referenced ? (
              <p className="mt-1 text-xs text-text-secondary">Retained in referral history</p>
            ) : null}
          </div>
        ),
      },
      {
        key: "action",
        header: "Action",
        align: "right",
        render: (config) =>
          isAdmin ? null : (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === config.id}
                onClick={() => void toggle(config)}
              >
                {busyId === config.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                {config.active ? "Retire" : "Make live"}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busyId === config.id || config.active || config.is_referenced}
                title={
                  config.active
                    ? "Retire this rule before deleting it."
                    : config.is_referenced
                      ? "Used rules are retained for referral history."
                      : "Permanently delete this unused rule."
                }
                onClick={() => setDeleteTarget(config)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete
              </Button>
            </div>
          ),
      },
    ],
    [busyId, isAdmin, toggle],
  );

  const activityColumns = React.useMemo<readonly DataColumn<ReferralPayoutActivity>[]>(
    () => [
      {
        key: "description",
        header: "Payout",
        render: (row) => (
          <DataTablePrimaryCell title={row.description} subtitle={row.currency} />
        ),
      },
      {
        key: "amount",
        header: "Amount",
        align: "right",
        render: (row) => (
          <span className="font-medium tabular-nums">{formatPaise(row.amount_paise)}</span>
        ),
      },
      {
        key: "line",
        header: "Line",
        render: (row) => LINE_LABEL[row.business_line] ?? row.business_line,
      },
      {
        key: "state",
        header: "State",
        render: (row) => {
          const meta = ACTIVITY_STATUS_META[row.status] ?? {
            label: row.status,
            tone: "neutral" as const,
          };
          return <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>;
        },
      },
      { key: "date", header: "Created", render: (row) => formatDate(row.created_at) },
    ],
    [],
  );

  return (
    <DashboardPage>
      {confirmDialog}
      <DashboardHeader
        title="Referral bonus rules"
        description={
          isAdmin
            ? "Review configured rules and recent payout activity without changing authoring state."
            : "Configure bonus eligibility and activation; payout execution remains an Admin finance workflow."
        }
        actions={
          isAdmin ? undefined : (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New rule
            </Button>
          )
        }
      />

      {error ? (
        <FetchError status={null} message={error} onRetry={() => void reload()} />
      ) : (
        <>
          <MetricGrid>
            <MetricCard
              label="Configured rules"
              value={configs.length}
              icon={DASHBOARD_ICONS.referrals}
            />
            <MetricCard
              label="Live rules"
              value={configs.filter((item) => item.active).length}
              icon={DASHBOARD_ICONS.analytics}
            />
            <MetricCard
              label="Covered line scopes"
              value={new Set(configs.map((item) => item.business_line)).size}
              icon={DASHBOARD_ICONS.accessControl}
            />
            <MetricCard
              label="Recent payouts"
              value={activity.length}
              icon={DASHBOARD_ICONS.payouts}
            />
          </MetricGrid>

          <FilterBar
            value={filters}
            onChange={setFilters}
            searchLabel="Search referral rules"
            searchPlaceholder="Amount or condition"
            statusOptions={RULE_STATUS_OPTIONS}
            statusLabel="rule states"
            showDates
          />
          <DashboardPanel
            title="Bonus rules"
            description="Current configuration by business-line scope."
            bodyClassName="p-0"
          >
            {loading ? (
              <div className="p-5">
                <ListLoadingState rows={5} />
              </div>
            ) : filteredRules.length === 0 ? (
              <ListEmptyState
                icon={Gift}
                title={configs.length ? "No rules match these filters" : "No bonus rules yet"}
                description="Clear the filters or create the first referral rule."
                className="m-5"
              />
            ) : (
              <>
                <DataTable
                  columns={ruleColumns}
                  rows={rulesPage.pageRows}
                  rowKey={(config) => config.id}
                  minWidth="min-w-[760px]"
                />
                <div className="px-5 pb-5">
                  <ListPagination
                    page={rulesPage.page}
                    total={rulesPage.total}
                    onPageChange={rulesPage.setPage}
                  />
                </div>
              </>
            )}
          </DashboardPanel>

          <FilterBar
            value={activityFilters}
            onChange={setActivityFilters}
            searchLabel="Search payout activity"
            searchPlaceholder="Description, currency, or amount"
            statusOptions={ACTIVITY_STATUS_OPTIONS}
            statusLabel="payout states"
          />
          <DashboardPanel
            title="Recent payout activity"
            description="Read-only settlement history; payouts are executed by Admin and finance."
            bodyClassName="p-0"
          >
            {loading ? (
              <div className="p-5">
                <ListLoadingState rows={5} />
              </div>
            ) : filteredActivity.length === 0 ? (
              <ListEmptyState
                icon={Gift}
                title="No payout activity matches these filters"
                description="Clear or adjust the filters to return to settlement history."
                className="m-5"
              />
            ) : (
              <>
                <DataTable
                  columns={activityColumns}
                  rows={activityPage.pageRows}
                  rowKey={(row) => row.id}
                  minWidth="min-w-[720px]"
                />
                <div className="px-5 pb-5">
                  <ListPagination
                    page={activityPage.page}
                    total={activityPage.total}
                    onPageChange={activityPage.setPage}
                  />
                </div>
              </>
            )}
          </DashboardPanel>
        </>
      )}

      {isAdmin ? null : (
        <>
        <Dialog open={createOpen} onOpenChange={closeCreate}>
          <DialogContent showCloseButton={false} className={PANEL_DIALOG_CLASS}>
            <WorkspaceDialogHeader
              title="New bonus rule"
              description="Set eligibility and amount. This workspace never initiates or approves a payout."
              closeLabel="Close referral rule workspace"
            />
            <div className="min-h-0 overflow-y-auto py-2">
              <div className="mx-auto max-w-3xl rounded-xl border border-border bg-card p-5">
                <ReferralConfigForm
                  onDirtyChange={setCreateDirty}
                  onCreated={() => {
                    setCreateDirty(false);
                    setCreateOpen(false);
                    void reload();
                  }}
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete unused referral rule?</DialogTitle>
              <DialogDescription>
                This permanently removes the retired rule. Rules already used by a referral are
                retained and cannot be deleted.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={!deleteTarget || busyId === deleteTarget.id}
                onClick={() => void remove()}
              >
                {deleteTarget && busyId === deleteTarget.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                )}
                Delete rule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </>
      )}
    </DashboardPage>
  );
}
