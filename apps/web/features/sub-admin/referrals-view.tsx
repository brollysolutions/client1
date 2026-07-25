"use client";

import * as React from "react";
import { Inbox, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPaiseCompact } from "@/lib/format";
import { updateReferralBonusConfig, type ReferralBonusConfig } from "@/lib/referral-bonus-api";
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

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Referral bonus</h1>
        <p className="text-sm text-text-secondary">
          {isAdmin
            ? "Read-only view of the referral bonus rules and recent payout activity."
            : "Set the referral bonus rules. Payouts themselves are handled separately by finance."}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border bg-card py-16">
          <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-text-secondary">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          {!isAdmin ? <ReferralConfigForm onCreated={() => void reload()} /> : null}

          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">Bonus rules</h2>
            {configs.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
                <Inbox className="h-8 w-8 text-text-secondary" aria-hidden="true" />
                <p className="mt-3 font-medium text-text-primary">No bonus rules yet</p>
                <p className="mt-1 text-sm text-text-secondary">
                  {isAdmin
                    ? "Rules the content team creates will show up here."
                    : "Set your first referral bonus rule above."}
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {configs.map((config) => (
                  <li
                    key={config.id}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-text-primary">
                        ₹{config.bonus_amount} bonus · {LINE_LABEL[config.business_line] ?? config.business_line}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-text-secondary">
                        {Object.keys(config.rule).length > 0
                          ? Object.entries(config.rule)
                              .map(([key, value]) => `${key.replace(/_/g, " ")}: ${value}`)
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
                            <Loader2 className="h-4 w-4 animate-spin" />
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
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-text-primary">Recent payout activity</h2>
            <p className="text-sm text-text-secondary">
              Read-only. Payouts are executed by Admin and finance, never from this screen.
            </p>
            {activity.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-8 text-center">
                <p className="text-sm text-text-secondary">No referral payouts yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-text-secondary">
                      <th className="px-4 py-2 font-medium">Amount</th>
                      <th className="px-4 py-2 font-medium">Line</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.map((row) => (
                      <tr key={row.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 font-medium text-text-primary">
                          {formatPaiseCompact(row.amount_paise)}
                        </td>
                        <td className="px-4 py-2 text-text-secondary">
                          {row.business_line ? (LINE_LABEL[row.business_line] ?? row.business_line) : "Global"}
                        </td>
                        <td className="px-4 py-2 text-text-secondary capitalize">{row.status}</td>
                        <td className="px-4 py-2 text-text-secondary">
                          {new Date(row.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
