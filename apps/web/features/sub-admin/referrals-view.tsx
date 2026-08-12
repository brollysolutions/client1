"use client";

import * as React from "react";
import { Inbox, Loader2, Maximize2, Plus } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AdminPagination, ADMIN_PAGE_SIZE } from "@/features/admin/admin-list-tools";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import { DashboardHeader, DashboardPage, DashboardPanel, MetricCard, MetricGrid } from "@/features/dashboard/dashboard-ui";
import { formatPaiseCompact } from "@/lib/format";
import { updateReferralBonusConfig, type ReferralBonusConfig } from "@/lib/referral-bonus-api";

import { filterReferralActivity, filterReferralRules, type QueueFilters } from "./cms-filters";
import { CmsFilterBar, CmsWorkspaceHeader, CMS_WORKSPACE_DIALOG_CLASS } from "./cms-workspace";
import { ReferralConfigForm } from "./referral-config-form";
import { useReferralBonus } from "./use-referral-bonus";

const EMPTY_FILTERS: QueueFilters = { search: "", status: "all", line: "all", kind: "all", from: "", to: "" };
const LINE_LABEL: Record<string, string> = { loans: "Loans", real_estate: "Real Estate", both: "Both lines" };

export function ReferralsView() {
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";
  const { configs, activity, loading, error, reload } = useReferralBonus();
  const [filters, setFilters] = React.useState(EMPTY_FILTERS);
  const [activityFilters, setActivityFilters] = React.useState(EMPTY_FILTERS);
  const [page, setPage] = React.useState(0);
  const [activityPage, setActivityPage] = React.useState(0);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createDirty, setCreateDirty] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const filteredRules = React.useMemo(() => filterReferralRules(configs, filters), [configs, filters]);
  const filteredActivity = React.useMemo(() => filterReferralActivity(activity, activityFilters), [activity, activityFilters]);
  React.useEffect(() => setPage(0), [filters]);
  React.useEffect(() => setActivityPage(0), [activityFilters]);
  async function toggle(config: ReferralBonusConfig) { setBusyId(config.id); const result = await updateReferralBonusConfig(config.id, { active: !config.active }); setBusyId(null); if (result.ok) { toast.success(result.data.active ? "Rule activated" : "Rule deactivated"); void reload(); } else toast.error("Could not update rule", { description: result.error }); }
  function closeCreate(openState: boolean) { if (openState) return setCreateOpen(true); if (createDirty && !window.confirm("Discard this referral rule?")) return; setCreateOpen(false); setCreateDirty(false); }
  const rulePage = filteredRules.slice(page * ADMIN_PAGE_SIZE, (page + 1) * ADMIN_PAGE_SIZE);
  const payoutPage = filteredActivity.slice(activityPage * ADMIN_PAGE_SIZE, (activityPage + 1) * ADMIN_PAGE_SIZE);

  return (
    <DashboardPage>
      <DashboardHeader eyebrow="Referral programme" title="Referral bonus rules" description={isAdmin ? "Review configured rules and recent payout activity without changing authoring state." : "Configure bonus eligibility and activation; payout execution remains an Admin finance workflow."} actions={!isAdmin ? <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />New rule</Button> : undefined} />
      {loading ? <Loading /> : error ? <ErrorState error={error} reload={reload} /> : <>
        <MetricGrid><MetricCard label="Configured rules" value={configs.length} icon={DASHBOARD_ICONS.referrals} /><MetricCard label="Active rules" value={configs.filter((item) => item.active).length} icon={DASHBOARD_ICONS.analytics} /><MetricCard label="Covered line scopes" value={new Set(configs.map((item) => item.business_line)).size} icon={DASHBOARD_ICONS.accessControl} /><MetricCard label="Recent payouts" value={activity.length} icon={DASHBOARD_ICONS.payouts} /></MetricGrid>
        <CmsFilterBar value={filters} onChange={setFilters} searchLabel="Search referral rules" statusOptions={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
        <DashboardPanel title="Bonus rules" description="Current configuration by business-line scope" action={!isAdmin ? <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}><Maximize2 className="h-4 w-4" />Open rule workspace</Button> : undefined}>
          {filteredRules.length === 0 ? <Empty message={configs.length ? "No rules match these filters." : "No bonus rules yet."} /> : <><ul className="divide-y divide-border">{rulePage.map((config) => <li key={config.id} className="flex flex-wrap items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><p className="font-medium text-text-primary">₹{config.bonus_amount} bonus · {LINE_LABEL[config.business_line] ?? config.business_line}</p><p className="mt-0.5 truncate text-xs text-text-secondary">{Object.keys(config.rule).length ? Object.entries(config.rule).map(([key, value]) => `${key.replace(/_/g, " ")}: ${String(value)}`).join(" · ") : "No extra conditions"}</p></div><div className="flex items-center gap-3"><Badge variant={config.active ? "secondary" : "outline"}>{config.active ? "Active" : "Inactive"}</Badge>{!isAdmin ? <Button size="sm" variant="outline" disabled={busyId === config.id} onClick={() => void toggle(config)}>{busyId === config.id ? <Loader2 className="h-4 w-4 animate-spin" /> : config.active ? "Deactivate" : "Activate"}</Button> : null}</div></li>)}</ul><AdminPagination page={page} total={filteredRules.length} onPageChange={setPage} /></>}
        </DashboardPanel>
        <CmsFilterBar value={activityFilters} onChange={setActivityFilters} searchLabel="Search payout activity" statusOptions={[{ value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "paid", label: "Paid" }, { value: "failed", label: "Failed" }]} />
        <DashboardPanel title="Recent payout activity" description="Read-only settlement history; payouts are executed by Admin and finance.">{filteredActivity.length === 0 ? <p className="text-sm text-text-secondary">No payout activity matches these filters.</p> : <><div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[560px] text-sm"><thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-text-secondary"><tr><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Line</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Date</th></tr></thead><tbody>{payoutPage.map((row) => <tr key={row.id} className="border-b border-border last:border-0"><td className="px-4 py-3 font-medium">{formatPaiseCompact(row.amount_paise)}</td><td className="px-4 py-3 text-text-secondary">{LINE_LABEL[row.business_line]}</td><td className="px-4 py-3 capitalize text-text-secondary">{row.status}</td><td className="px-4 py-3 text-text-secondary">{new Date(row.created_at).toLocaleDateString("en-IN")}</td></tr>)}</tbody></table></div><AdminPagination page={activityPage} total={filteredActivity.length} onPageChange={setActivityPage} /></>}</DashboardPanel>
      </>}
      {!isAdmin ? <Dialog open={createOpen} onOpenChange={closeCreate}><DialogContent showCloseButton={false} className={CMS_WORKSPACE_DIALOG_CLASS}><CmsWorkspaceHeader title="New bonus rule" description="Set eligibility and amount. This workspace never initiates or approves a payout." /><div className="min-h-0 overflow-y-auto py-2"><div className="mx-auto max-w-3xl rounded-xl border border-border bg-card p-5"><ReferralConfigForm onDirtyChange={setCreateDirty} onCreated={() => { setCreateDirty(false); setCreateOpen(false); void reload(); }} /></div></div></DialogContent></Dialog> : null}
    </DashboardPage>
  );
}

function Loading() { return <div className="flex min-h-64 items-center justify-center rounded-xl border border-border bg-card"><Loader2 className="h-6 w-6 animate-spin text-brand-navy" /></div>; }
function ErrorState({ error, reload }: { error: string; reload: () => Promise<void> }) { return <div className="rounded-xl border border-border bg-card p-8 text-center"><p className="text-sm text-text-secondary">{error}</p><Button variant="outline" className="mt-4" onClick={() => void reload()}>Try again</Button></div>; }
function Empty({ message }: { message: string }) { return <div className="flex min-h-40 flex-col items-center justify-center text-center"><Inbox className="h-8 w-8 text-text-secondary" /><p className="mt-3 font-medium">{message}</p></div>; }
