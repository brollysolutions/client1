"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { FetchError } from "@/features/dashboard/fetch-error";
import { getMyLoanOfficer, type LoanOfficerContact } from "@/lib/loans";

type Status = "loading" | "ready" | "error";

export function LoanOfficerView() {
  const router = useRouter();
  const [officer, setOfficer] = React.useState<LoanOfficerContact | null>(null);
  const [status, setStatus] = React.useState<Status>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const retry = React.useCallback(() => {
    setStatus("loading");
    setError(null);
    setErrorStatus(null);
    setReloadKey((k) => k + 1);
  }, []);

  React.useEffect(() => {
    let active = true;
    const run = async () => {
      const res = await getMyLoanOfficer();
      if (!active) return;
      if (res.ok) {
        setOfficer(res.data);
        setStatus("ready");
        return;
      }
      setError(res.error);
      setErrorStatus(res.status);
      setStatus("error");
    };
    void run();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">My Loan Officer</h1>
        <p className="text-sm text-text-secondary">Your assigned loan officer.</p>
      </div>

      {status === "loading" ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : status === "error" ? (
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      ) : officer === null ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-loans-soft text-loans-accent">
            <UserRound className="h-5 w-5" />
          </span>
          <p className="mx-auto mt-4 max-w-sm text-sm text-text-secondary">
            No loan officer assigned yet. Once your application is picked up, they will show up
            here.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-4">
            <UserAvatar name={officer.name} size="lg" />
            <div className="min-w-0">
              <p className="font-semibold text-text-primary">{officer.name}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-text-secondary">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {officer.staffCode}
              </p>
            </div>
          </div>

          <p className="mt-5 border-t border-border pt-5 text-sm text-text-secondary">
            For your privacy, direct phone and email aren&apos;t shown here. Raise a support
            ticket and our team will connect you.
          </p>

          <Button className="mt-2 w-full sm:w-auto" onClick={() => router.push("/dashboard/support")}>
            Contact loan officer
          </Button>
        </div>
      )}
    </div>
  );
}
