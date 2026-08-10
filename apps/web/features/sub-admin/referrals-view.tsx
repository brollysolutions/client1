"use client";

import * as React from "react";
import { Inbox, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import {
  DashboardHeader,
  DashboardPage,
  DashboardPanel,
  MetricCard,
  MetricGrid,
} from "@/features/dashboard/dashboard-ui";
import { formatPaiseCompact } from "@/lib/format";
import {
  updateReferralBonusConfig,
  type ReferralBonusConfig,
} from "@/lib/referral-bonus-api";

import { ReferralConfigForm } from "./referral-config-form";
import { useReferralBonus } from "./use-referral-bonus";

const LINE_LABEL: Record<string, string> = {
  loans: "Loans",
  real_estate: "Real Estate",
  both: "Both lines",
};

export function ReferralsView() {
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";
  const { configs, activity, loading, error, reload } = useReferralBonus();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function onToggleActive(config: ReferralBonusConfig) {
    setBusyId(config.id);
    const res = await updateReferralBonusConfig(config.id, { active: !config.active });
    setBusyId(null);
    if (res.ok) {
      toast.success(res.data.active ? "Rule activated" : "Rule deactivated");
      void reload();
    } else {
      toast.error("Could not update the rule", { description: res.error });
    }
  }

  const activeRules = configs.filter((config) => config.active).length;
  const configuredLines = new Set(configs.map((config) => config.business_line)).size;

  return (
    <DashboardPage>
      <DashboardHeader
        eyebrow="Referral programme"
        title="Referral bonus rules"
        description={
          isAdmin
            ? "Review configured bonus rules and recent payout activity without changing authoring state."
            : "Configure bonus eligibility and activation; payout execution remains an Admin finance workflow."
        }
      />

      {loading ? (
        <div className="flex min-h-64 items-center justify-center rounded-xl border border-border bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-text-secondary">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <MetricGrid>
            <MetricCard
              label="Configured rules"
              value={configs.length}
              icon={DASHBOARD_ICONS.referrals}
            />
            <MetricCard
              label="Active rules"
              value={activeRules}
              icon={DASHBOARD_ICONS.referrals}
              attention={activeRules === 0 && configs.length > 0}
            />
            <MetricCard
              label="Covered line scopes"
              value={configuredLines}
              icon={DASHBOARD_ICONS.accessControl}
            />
            <MetricCard
              label="Recent payouts"
              value={activity.length}
              icon={DASHBOARD_ICONS.payouts}
            />
          </MetricGrid>

          <div
            className={
              isAdmin
                ? "grid gap-4"
                : "grid items-start gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
            }
          >
            {!isAdmin ? (
              <DashboardPanel
                title="New bonus rule"
                description="Set the amount and conditions. This form never initiates a payout."
              >
                <ReferralConfigForm onCreated={() => void reload()} />
              </DashboardPanel>
            ) : null}

            <DashboardPanel
              title="Bonus rules"
              description="Current configuration by business-line scope"
            >
              {configs.length === 0 ? (
                <div className="flex min-h-40 flex-col items-center justify-center text-center">
                  <Inbox className="h-8 w-8 text-text-secondary" aria-hidden="true" />
                  <p className="mt-3 font-medium text-text-primary">No bonus rules yet</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    {isAdmin
                      ? "Rules the content team creates will show up here."
                      : "Create the first referral bonus rule from this workspace."}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {configs.map((config) => (
                    <li
                      key={config.id}
                      className="flex flex-wrap items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-text-primary">
                          ₹{config.bonus_amount} bonus ·{" "}
                          {LINE_LABEL[config.business_line] ?? config.business_line}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-text-secondary">
                          {Object.keys(config.rule).length > 0
                            ? Object.entries(config.rule)
                                .map(([key, value]) =>
                                  `${key.replace(/_/g, " ")}: ${value}`,
                                )
                                .join(" · ")
                            : "No extra conditions"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <Badge variant={config.active ? "secondary" : "outline"}>
                          {config.active ? "Active" : "Inactive"}
                        </Badge>
                        {!isAdmin ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === config.id}
                            onClick={() => void onToggleActive(config)}
                          >
                            {busyId === config.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : config.active ? (
                              "Deactivate"
                            ) : (
                              "Activate"
                            )}
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </DashboardPanel>
          </div>

          <DashboardPanel
            title="Recent payout activity"
            description="Read-only settlement history; payouts are executed by Admin and finance."
          >
            {activity.length === 0 ? (
              <p className="text-sm text-text-secondary">No referral payouts yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-text-secondary">
                    <tr>
                      <th className="px-4 py-3 font-medium">Amount</th>
                      <th className="px-4 py-3 font-medium">Line</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.map((row) => (
                      <tr key={row.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-medium text-text-primary">
                          {formatPaiseCompact(row.amount_paise)}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {row.business_line
                            ? (LINE_LABEL[row.business_line] ?? row.business_line)
                            : "Global"}
                        </td>
                        <td className="px-4 py-3 capitalize text-text-secondary">
                          {row.status}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {new Date(row.created_at).toLocaleDateString("en-IN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DashboardPanel>
        </>
      )}
    </DashboardPage>
  );
}
