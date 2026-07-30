"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Info, Landmark } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LoanOfferCard } from "@/features/loans/loan-offer-card";
import { useLoanCompare } from "@/features/loans/loan-offers-store";
import { FetchError } from "@/features/dashboard/fetch-error";
import { getBanks, getLoanTypes, type Bank, type LoanTypeOption } from "@/lib/loans";

type Status = "loading" | "ready" | "error";

type BanksByType = Record<string, Bank[]>;

// GET /loans/loan-types has no cap (unlike every public_catalog list, which
// caps per category as a DoS backstop) -- fine for a handful of real
// products, but this app's shared dev/test Postgres has accumulated
// thousands of test-seeded rows (never truncated, see memory
// shared-test-db-accumulation-gotcha), and one GET /loans/banks fetch per
// type would fan out into that many concurrent requests. Cap how many
// sections this page fans out bank-fetches for so a polluted reference
// table degrades gracefully instead of exhausting browser connections.
const RENDERED_LOAN_TYPES_LIMIT = 12;

// Loans line's "Compare Loan Offers" -> real participating banks per loan
// type (GET /loans/banks?loan_type_id=). No fabricated interest rates,
// tenures, or fees: loan_types/banks are reference tables only, a rate only
// ever exists once a real loan_application is reviewed. feature-status §2-7.
export function LoanOffersView() {
  const router = useRouter();
  const compare = useLoanCompare();

  const [status, setStatus] = React.useState<Status>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [loanTypes, setLoanTypes] = React.useState<LoanTypeOption[]>([]);
  const [banksByType, setBanksByType] = React.useState<BanksByType>({});

  const retry = React.useCallback(() => {
    setStatus("loading");
    setError(null);
    setErrorStatus(null);
    setReloadKey((k) => k + 1);
  }, []);

  React.useEffect(() => {
    let active = true;
    const run = async () => {
      const typesRes = await getLoanTypes();
      if (!active) return;
      if (!typesRes.ok) {
        setError(typesRes.error);
        setErrorStatus(typesRes.status);
        setStatus("error");
        return;
      }
      const renderedTypes = typesRes.data.slice(0, RENDERED_LOAN_TYPES_LIMIT);
      const bankResults = await Promise.all(renderedTypes.map((type) => getBanks(type.id)));
      if (!active) return;
      const firstFailure = bankResults.find((r) => !r.ok);
      if (firstFailure && !firstFailure.ok) {
        setError(firstFailure.error);
        setErrorStatus(firstFailure.status);
        setStatus("error");
        return;
      }
      const byType: BanksByType = {};
      renderedTypes.forEach((type, i) => {
        const result = bankResults[i];
        byType[type.id] = result.ok ? result.data : [];
      });
      setLoanTypes(renderedTypes);
      setBanksByType(byType);
      setStatus("ready");
    };
    void run();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const allBanks = Object.values(banksByType).flat();
  const shortlisted = compare.ids
    .map((id) => allBanks.find((b) => b.id === id))
    .filter((b): b is Bank => Boolean(b));

  if (status === "loading") {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-10">
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Compare Loan Offers</h1>
          <p className="text-sm text-text-secondary">
            See which banks we work with for each loan type. Shortlist up to 3 to keep track.
          </p>
        </div>
        <Button onClick={() => router.push("/dashboard/apply")}>Apply for a loan</Button>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-text-secondary">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" aria-hidden="true" />
        <p>
          Interest rates, tenure, and processing fees are quoted to you after your application is
          reviewed, once a bank is matched to your profile.
        </p>
      </div>

      {shortlisted.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-text-primary">
              Your shortlist ({shortlisted.length}/3)
            </p>
            <button
              type="button"
              onClick={compare.clear}
              className="cursor-pointer text-sm text-text-secondary transition-colors hover:text-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
            >
              Clear all
            </button>
          </div>
          <ul className="mt-3 flex flex-wrap gap-2">
            {shortlisted.map((bank) => (
              <li
                key={bank.id}
                className="flex items-center gap-1.5 rounded-full bg-loans-soft px-3 py-1 text-xs font-medium text-loans-accent"
              >
                <Landmark className="h-3 w-3" aria-hidden="true" />
                {bank.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-8">
        {loanTypes.map((type) => {
          const banks = banksByType[type.id] ?? [];
          return (
            <section key={type.id}>
              <h2 className="font-heading text-xl font-semibold text-text-primary">
                {type.label}
              </h2>
              {banks.length === 0 ? (
                <p className="mt-3 text-sm text-text-secondary">
                  No participating banks for this loan type yet.
                </p>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {banks.map((bank) => (
                    <LoanOfferCard key={bank.id} bank={bank} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
