"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, CircleDot, Clock, XCircle } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getLoanApplication, type LoanApplication } from "@/lib/loans";

import { FetchError } from "@/features/dashboard/fetch-error";
import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import { DashboardHeader, DashboardPage, DashboardPanel, MetricCard, MetricGrid } from "@/features/dashboard/dashboard-ui";
import {
  FEE_OUTCOME_LABEL,
  PIPELINE,
  STATUS_STYLES,
  formatAmount,
  formatDate,
  formatRate,
} from "@/features/dashboard/loan-format";
import { FormAnswerSummary } from "@/features/loans/form-answer-summary";

type Status = "loading" | "ready" | "error";

export default function LoanDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [application, setApplication] = React.useState<LoanApplication | null>(null);
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
      const res = await getLoanApplication(id);
      if (!active) return;
      if (res.ok) {
        setApplication(res.data);
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
  }, [id, reloadKey]);

  return (
    <DashboardPage>
      {status === "loading" ? (
        <div className="space-y-4">
          <Skeleton className="h-9 w-56 rounded-lg" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : status === "error" ? (
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      ) : application ? (
        <LoanDetail application={application} />
      ) : null}
    </DashboardPage>
  );
}

function LoanDetail({ application: a }: { application: LoanApplication }) {
  const s = STATUS_STYLES[a.status];
  const offPipeline = a.status === "rejected" || a.status === "on_hold";
  const activeIndex = offPipeline ? -1 : PIPELINE.indexOf(a.status);

  return (
    <div className="space-y-6">
      <DashboardHeader
        eyebrow="Loan application"
        title={a.loanTypeLabel}
        description={`Applied on ${formatDate(a.openedOn)}. Follow the current decision and next stage below.`}
        actions={
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-cta hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              All loans
            </Link>
            <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-medium", s.className)}>
              {s.label}
            </span>
          </div>
        }
      />

      <MetricGrid>
        <MetricCard label="Requested" value={formatAmount(a.amountRequested)} icon={DASHBOARD_ICONS.loanApplications} />
        <MetricCard label="Sanctioned" value={formatAmount(a.amountSanctioned)} icon={DASHBOARD_ICONS.earnings} />
        <MetricCard label="Interest rate" value={formatRate(a.interestRate)} icon={DASHBOARD_ICONS.loanConfiguration} />
        <MetricCard
          label="Processing fee"
          value={formatAmount(a.processingFee)}
          hint={a.feeOutcome ? FEE_OUTCOME_LABEL[a.feeOutcome] : "Not finalized"}
          icon={DASHBOARD_ICONS.transactions}
        />
      </MetricGrid>

      {offPipeline && a.statusReason ? (
        <div
          className={cn(
            "flex items-start gap-3 rounded-xl border p-4 text-sm",
            a.status === "rejected"
              ? "border-error/20 bg-error/5 text-error"
              : "border-warning/20 bg-warning/5 text-warning",
          )}
        >
          {a.status === "rejected" ? (
            <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
          ) : (
            <Clock className="mt-0.5 h-5 w-5 shrink-0" />
          )}
          <div>
            <p className="font-medium">
              {a.status === "rejected" ? "This application was not approved" : "This application is on hold"}
            </p>
            <p className="mt-0.5 text-text-secondary">{a.statusReason}</p>
          </div>
        </div>
      ) : null}

      <DashboardPanel title="Loan details" description="Terms recorded against this application.">
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Term label="Amount requested" value={formatAmount(a.amountRequested)} />
          <Term label="Amount sanctioned" value={formatAmount(a.amountSanctioned)} />
          <Term label="Interest rate" value={formatRate(a.interestRate)} />
          <Term
            label="Processing fee"
            value={
              a.feeOutcome
                ? `${formatAmount(a.processingFee)} · ${FEE_OUTCOME_LABEL[a.feeOutcome]}`
                : formatAmount(a.processingFee)
            }
          />
          {a.closedOn ? <Term label="Closed on" value={formatDate(a.closedOn)} /> : null}
        </dl>
      </DashboardPanel>

      {a.formSchema && a.formAnswers ? (
        <DashboardPanel
          title="Submitted application"
          description={`The answers saved with form version ${a.formVersion ?? 1}.`}
        >
          <FormAnswerSummary schema={a.formSchema} answers={a.formAnswers} />
        </DashboardPanel>
      ) : null}

      {/* Journey timeline */}
      <DashboardPanel title="Application journey" description="Your application moves through these operational stages.">
        <ol className="mt-5 space-y-0">
          {PIPELINE.map((stage, i) => {
            const done = activeIndex >= 0 && i < activeIndex;
            const current = activeIndex >= 0 && i === activeIndex;
            const isLast = i === PIPELINE.length - 1;
            return (
              <li key={stage} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2",
                      done && "border-loans-accent bg-loans-accent text-white",
                      current && "border-loans-accent text-loans-accent",
                      !done && !current && "border-border text-text-secondary",
                    )}
                  >
                    {done ? (
                      <Check className="h-4 w-4" />
                    ) : current ? (
                      <CircleDot className="h-4 w-4" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    )}
                  </span>
                  {!isLast && (
                    <span
                      className={cn(
                        "min-h-8 w-0.5 flex-1",
                        done ? "bg-loans-accent" : "bg-border",
                      )}
                    />
                  )}
                </div>
                <div className={cn("pb-8", isLast && "pb-0")}>
                  <p
                    className={cn(
                      "text-sm font-medium",
                      current ? "text-loans-accent" : done ? "text-text-primary" : "text-text-secondary",
                    )}
                  >
                    {STATUS_STYLES[stage].label}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
        {offPipeline ? (
          <p className="mt-2 text-xs text-text-secondary">
            {a.status === "rejected"
              ? "This application did not proceed through the full journey."
              : "The journey is paused. Our team will pick it back up soon."}
          </p>
        ) : null}
      </DashboardPanel>
    </div>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">{label}</dt>
      <dd className="mt-1 text-sm text-text-primary">{value}</dd>
    </div>
  );
}
