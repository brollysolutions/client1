"use client";

import * as React from "react";

import {
  listReferralBonusConfigs,
  listReferralPayoutActivity,
  type ReferralBonusConfig,
  type ReferralPayoutActivity,
} from "@/lib/referral-bonus-api";

// Fetches every config (shared queue) plus the recent referral-payout activity
// feed together, since the view renders both. Exposes a single refetch used
// after create/edit so both lists stay in sync.
export function useReferralBonus() {
  const [configs, setConfigs] = React.useState<ReferralBonusConfig[]>([]);
  const [activity, setActivity] = React.useState<ReferralPayoutActivity[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const [configsRes, activityRes] = await Promise.all([
      listReferralBonusConfigs(),
      listReferralPayoutActivity(),
    ]);
    if (configsRes.ok) setConfigs(configsRes.data);
    else setError(configsRes.error);
    if (activityRes.ok) setActivity(activityRes.data);
    else if (configsRes.ok) setError(activityRes.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { configs, activity, loading, error, reload: load };
}
