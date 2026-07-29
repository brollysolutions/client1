"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CreditCard, IdCard, Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { FileField } from "@/components/apply-as-agent/file-field";
import { IconInput } from "@/components/icon-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";
import {
  uploadLoanDocuments,
  type LoanDocType,
  type LoanDocumentUploadEntry,
} from "@/lib/loan-documents";
import {
  createLoanApplication,
  getLoanApplications,
  getLoanTypes,
  type LoanApplication,
  type LoanTypeOption,
} from "@/lib/loans";
import { cn } from "@/lib/utils";

type PageStatus = "loading" | "ready" | "error";

function findActiveApplication(applications: LoanApplication[]): LoanApplication | null {
  // Mirrors the DB's partial-unique predicate (status NOT IN ('closed',
  // 'rejected')) — at most one such row can exist per client at a time.
  return applications.find((a) => a.status !== "closed" && a.status !== "rejected") ?? null;
}

function validateAmount(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "Enter the amount you'd like to borrow.";
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount <= 0) return "Enter a valid amount.";
  return undefined;
}

// Dashboard "Apply" — creates a real loan_application (not a lead). Rebuilt
// in the landing partner-form's design language (IconInput, FileField KYC
// tiles, a completion meter): components/apply-as-agent/file-field.tsx,
// components/icon-input.tsx. KYC tiles are optional — a representative can
// also collect these later — so only loan type + amount are required to
// submit; any files picked upload right after the application is created.
export default function ApplyPage() {
  const router = useRouter();

  const [status, setStatus] = React.useState<PageStatus>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const [loanTypes, setLoanTypes] = React.useState<LoanTypeOption[]>([]);
  const [activeApplication, setActiveApplication] = React.useState<LoanApplication | null>(null);

  const [loanTypeId, setLoanTypeId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [amountError, setAmountError] = React.useState<string | undefined>();
  const [aadhaarFront, setAadhaarFront] = React.useState<File | null>(null);
  const [aadhaarBack, setAadhaarBack] = React.useState<File | null>(null);
  const [pan, setPan] = React.useState<File | null>(null);

  const [submitting, setSubmitting] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<{ done: number; total: number } | null>(
    null,
  );

  const retry = React.useCallback(() => {
    setStatus("loading");
    setError(null);
    setErrorStatus(null);
    setReloadKey((k) => k + 1);
  }, []);

  React.useEffect(() => {
    let active = true;
    const run = async () => {
      const [typesRes, appsRes] = await Promise.all([getLoanTypes(), getLoanApplications()]);
      if (!active) return;
      if (!typesRes.ok) {
        setError(typesRes.error);
        setErrorStatus(typesRes.status);
        setStatus("error");
        return;
      }
      setLoanTypes(typesRes.data);
      setActiveApplication(appsRes.ok ? findActiveApplication(appsRes.data) : null);
      setStatus("ready");
    };
    void run();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const canSubmit = loanTypeId !== "" && !validateAmount(amount) && !submitting;

  const progressFlags = [
    loanTypeId !== "",
    !validateAmount(amount),
    aadhaarFront !== null,
    aadhaarBack !== null,
    pan !== null,
  ];
  const progressPercent = Math.round(
    (progressFlags.filter(Boolean).length / progressFlags.length) * 100,
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const amountMsg = validateAmount(amount);
    setAmountError(amountMsg);
    if (!loanTypeId || amountMsg) return;

    setSubmitting(true);
    const result = await createLoanApplication({ loanTypeId, amountRequested: amount.trim() });

    if (!result.ok) {
      setSubmitting(false);
      if (result.status === 409) {
        const appsRes = await getLoanApplications();
        setActiveApplication(appsRes.ok ? findActiveApplication(appsRes.data) : null);
        return;
      }
      toast.error(result.error || "Couldn't submit your application. Please try again.");
      return;
    }

    // The application itself is created — this is the part the user actually
    // asked for, so confirm it immediately and never roll it back over a
    // document-upload failure. Uploads run after, sequentially; a bad file
    // must not cost the other, already-succeeded ones.
    toast.success("Application submitted", {
      description: "We'll be in touch about the next steps.",
    });
    const applicationId = result.data.id;

    const entries: LoanDocumentUploadEntry[] = (
      [
        { docType: "aadhaar_front" as LoanDocType, file: aadhaarFront },
        { docType: "aadhaar_back" as LoanDocType, file: aadhaarBack },
        { docType: "pan" as LoanDocType, file: pan },
      ] as const
    )
      .filter((e): e is { docType: LoanDocType; file: File } => e.file !== null)
      .map((e) => ({ docType: e.docType, file: e.file }));

    if (entries.length === 0) {
      router.push(`/dashboard/loans/${applicationId}`);
      return;
    }

    setUploadProgress({ done: 0, total: entries.length });
    const { failed } = await uploadLoanDocuments(applicationId, entries, (done, total) =>
      setUploadProgress({ done, total }),
    );
    setUploadProgress(null);

    if (failed.length === 0) {
      router.push(`/dashboard/loans/${applicationId}`);
      return;
    }
    toast.warning("Application created. Some documents didn't upload.", {
      description: "You can add them from Documents.",
    });
    router.push("/dashboard/documents");
  }

  if (status === "loading") {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 sm:px-6 lg:px-10">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-10">
        <FetchError status={errorStatus} message={error} onRetry={retry} />
      </div>
    );
  }

  if (activeApplication) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 sm:px-6 lg:px-10">
        <h1 className="text-2xl font-semibold text-text-primary">Apply for a loan</h1>
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <h2 className="text-lg font-semibold text-text-primary">
            You already have an application in progress
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
            We can only track one active application at a time. This one will need to close
            before you can start another.
          </p>
          <Button
            className="mt-5"
            onClick={() => router.push(`/dashboard/loans/${activeApplication.id}`)}
          >
            View your application
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Apply for a loan</h1>
        <p className="text-sm text-text-secondary">
          Tell us what you need, and our team will take it from there.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-text-primary">Your application</span>
          <span aria-live="polite" className="text-sm font-medium tabular-nums text-brand-cta">
            {progressPercent}% complete
          </span>
        </div>
        <Progress
          value={progressPercent}
          aria-label="Application completion"
          className="mt-2 bg-brand-cta-tint"
          indicatorClassName="bg-brand-cta"
        />
      </div>

      <form onSubmit={handleSubmit} noValidate className="grid gap-8">
        <fieldset className="grid min-w-0 gap-4 border-0 p-0">
          <h3
            id="apply-loan-type-heading"
            className="font-heading text-lg font-semibold text-foreground"
          >
            Loan details
          </h3>
          <div
            role="group"
            aria-labelledby="apply-loan-type-heading"
            className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          >
            {loanTypes.map((loanType) => (
              <button
                key={loanType.id}
                type="button"
                aria-pressed={loanTypeId === loanType.id}
                onClick={() => setLoanTypeId(loanType.id)}
                disabled={submitting}
                className={cn(
                  "h-12 cursor-pointer rounded-lg border px-3 text-sm font-medium transition",
                  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-cta/50",
                  "disabled:cursor-default disabled:opacity-50",
                  loanTypeId === loanType.id
                    ? "border-brand-cta bg-brand-cta text-white"
                    : "border-border bg-transparent text-foreground hover:bg-brand-cta-tint",
                )}
              >
                {loanType.label}
              </button>
            ))}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="apply-amount">Amount requested</Label>
            <IconInput
              id="apply-amount"
              icon={Wallet}
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              onBlur={() => setAmountError(validateAmount(amount))}
              placeholder="500000"
              aria-invalid={!!amountError}
              aria-describedby={amountError ? "apply-amount-error" : undefined}
              disabled={submitting}
            />
            {amountError && (
              <p id="apply-amount-error" className="text-sm text-destructive">
                {amountError}
              </p>
            )}
          </div>
        </fieldset>

        <fieldset className="border-0 border-t border-border p-0 pt-8">
          <div className="rounded-xl border border-border bg-brand-cta-tint/30 p-5 sm:p-6">
            <h3 className="font-heading text-lg font-semibold text-foreground">KYC documents</h3>
            <p className="text-sm text-text-secondary">
              Optional for now. A representative can also collect these later.
            </p>
            <div className="mt-5 grid min-w-0 grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5">
              <FileField
                id="apply-aadhaar-front"
                label="Aadhaar front"
                icon={IdCard}
                value={aadhaarFront}
                onChange={setAadhaarFront}
                disabled={submitting}
              />
              <FileField
                id="apply-aadhaar-back"
                label="Aadhaar back"
                icon={IdCard}
                value={aadhaarBack}
                onChange={setAadhaarBack}
                disabled={submitting}
              />
              <FileField
                id="apply-pan"
                label="PAN card"
                icon={CreditCard}
                value={pan}
                onChange={setPan}
                disabled={submitting}
              />
            </div>
          </div>
        </fieldset>

        <div className="grid gap-2">
          <Button
            type="submit"
            disabled={!canSubmit}
            className="h-12 bg-brand-cta text-base text-white hover:bg-brand-cta-hover focus-visible:ring-brand-cta"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {submitting ? "Submitting..." : "Submit application"}
          </Button>
          <p aria-live="polite" className="text-center text-sm text-text-secondary">
            {uploadProgress
              ? `Uploading ${uploadProgress.done} of ${uploadProgress.total}…`
              : null}
          </p>
        </div>
      </form>
    </div>
  );
}
