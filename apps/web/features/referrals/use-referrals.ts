"use client";

import * as React from "react";

import { getMyReferral, listReferrals, type MyReferral, type Referral } from "@/lib/referrals-api";

// Fetches the client's own code/eligibility/stats plus their referral list
// together, since the view renders both. Mirrors
// features/sub-admin/use-referral-bonus.ts's shape.
export function useReferrals() {
  const [my, setMy] = React.useState<MyReferral | null>(null);
  const [referrals, setReferrals] = React.useState<Referral[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const [myRes, referralsRes] = await Promise.all([getMyReferral(), listReferrals()]);
    if (myRes.ok) setMy(myRes.data);
    else setError(myRes.error);
    if (referralsRes.ok) setReferrals(referralsRes.data);
    else if (myRes.ok) setError(referralsRes.error);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { my, referrals, loading, error, reload: load };
}
