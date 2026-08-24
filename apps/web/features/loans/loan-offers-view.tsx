"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Info, Landmark } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LoanOfferCard } from "@/features/loans/loan-offer-card";
import { useLoanCompare } from "@/features/loans/loan-offers-store";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import { DashboardHeader, DashboardPage, DashboardPanel, MetricCard, MetricGrid } from "@/features/dashboard/dashboard-ui";
import { FetchError } from "@/features/dashboard/fetch-error";
import { getBanks, getLoanTypes, type Bank, type LoanTypeOption } from "@/lib/loans";
import { formatLastUpdated } from "@/lib/format";

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
const BANK_PREVIEW_LIMIT = 12;

export function selectLoanComparisonTypes(types: LoanTypeOption[]): LoanTypeOption[] {
  return types
    .filter((type) => type.category === "loan")
    .slice(0, RENDERED_LOAN_TYPES_LIMIT);
}

export function banksForDisplay(banks: Bank[], expanded: boolean): Bank[] {
  return expanded ? banks : banks.slice(0, BANK_PREVIEW_LIMIT);
}

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
  const [expandedTypeIds, setExpandedTypeIds] = React.useState<Set<string>>(new Set());

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
      const renderedTypes = selectLoanComparisonTypes(typesRes.data);
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
      <DashboardPage>
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </DashboardPage>
    );
  }

  if (status === "error") {
    return (
      <DashboardPage>
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      </DashboardPage>
    );
  }

  return (
    <DashboardPage>
      <DashboardHeader
        title="Compare Loan Offers"
        description="Review participating banks by loan type and shortlist up to three options."
        actions={<Button onClick={() => router.push("/dashboard/apply")}>Apply for a loan</Button>}
      />

      <MetricGrid>
        <MetricCard label="Loan types" value={loanTypes.length} icon={DASHBOARD_ICONS.loanApplications} />
        <MetricCard label="Participating banks" value={allBanks.length} icon={Landmark} />
        <MetricCard label="Shortlisted" value={`${shortlisted.length}/3`} icon={DASHBOARD_ICONS.compare} />
        <MetricCard label="Next step" value="Apply" hint="Rates follow profile review" icon={DASHBOARD_ICONS.applyForLoan} href="/dashboard/apply" />
      </MetricGrid>

      <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-text-secondary">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" aria-hidden="true" />
        <p>
          Interest rates, tenure, and processing fees are quoted to you after your application is
          reviewed, once a bank is matched to your profile.
        </p>
      </div>

      {shortlisted.length > 0 && (
        <DashboardPanel title={`Your shortlist (${shortlisted.length}/3)`} action={
          <button
            type="button"
            onClick={compare.clear}
            className="cursor-pointer text-sm text-text-secondary transition-colors hover:text-brand-cta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
          >
            Clear all
          </button>
        }>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-text-secondary">Banks saved for this comparison session.</p>
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
        </DashboardPanel>
      )}

      <div className="space-y-8">
        {loanTypes.map((type) => {
          const banks = banksByType[type.id] ?? [];
          const expanded = expandedTypeIds.has(type.id);
          const visibleBanks = banksForDisplay(banks, expanded);
          return (
            <section key={type.id}>
              <h2 className="font-heading text-xl font-semibold text-text-primary">
                {type.label}
              </h2>
              <p className="mt-1 text-xs text-text-secondary">{formatLastUpdated(type.last_updated_at)}</p>
              {banks.length === 0 ? (
                <p className="mt-3 text-sm text-text-secondary">
                  No participating banks for this loan type yet.
                </p>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleBanks.map((bank) => (
                    <LoanOfferCard key={bank.id} bank={bank} />
                  ))}
                </div>
              )}
              {banks.length > BANK_PREVIEW_LIMIT ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4"
                  aria-expanded={expanded}
                  onClick={() => {
                    setExpandedTypeIds((current) => {
                      const next = new Set(current);
                      if (expanded) next.delete(type.id);
                      else next.add(type.id);
                      return next;
                    });
                  }}
                >
                  {expanded ? "Show fewer lenders" : `Show all ${banks.length} lenders`}
                </Button>
              ) : null}
            </section>
          );
        })}
      </div>
    </DashboardPage>
  );
}
