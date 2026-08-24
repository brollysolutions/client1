"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardHeader, DashboardPage, DashboardPanel } from "@/features/dashboard/dashboard-ui";
import { FetchError } from "@/features/dashboard/fetch-error";
import {
  FinancialProductFormFields,
  validateProductAnswers,
  type ProductAnswerErrors,
  type ProductAnswers,
} from "@/features/dashboard/financial-product-form";
import { useMe } from "@/features/dashboard/me-provider";
import { EXPLORE_CATEGORIES } from "@/features/dashboard/explore-categories";
import {
  createFinancialServiceEnquiry,
  createLoanApplication,
  getLoanApplications,
  getLoanTypes,
  type FinancialProduct,
  type LoanApplication,
} from "@/lib/loans";
import { formatLastUpdated } from "@/lib/format";

type PageStatus = "loading" | "ready" | "error";

function findActiveApplication(applications: LoanApplication[]): LoanApplication | null {
  return applications.find((application) => application.status !== "closed" && application.status !== "rejected") ?? null;
}

export default function ApplyPage() {
  return (
    <React.Suspense fallback={<div className="min-h-[24rem]" />}>
      <ApplyPageContent />
    </React.Suspense>
  );
}

function ApplyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedProduct = searchParams.get("product");
  const requestedOffer = searchParams.get("offer");
  const { me, status: meStatus } = useMe();
  const [status, setStatus] = React.useState<PageStatus>("loading");
  const [error, setError] = React.useState<string | null>(null);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [products, setProducts] = React.useState<FinancialProduct[]>([]);
  const [activeApplication, setActiveApplication] = React.useState<LoanApplication | null>(null);
  const [productId, setProductId] = React.useState("");
  const [providerOfferId, setProviderOfferId] = React.useState<string | undefined>();
  const [answers, setAnswers] = React.useState<ProductAnswers>({});
  const [answerErrors, setAnswerErrors] = React.useState<ProductAnswerErrors>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [submittedEnquiryLabel, setSubmittedEnquiryLabel] = React.useState<string | null>(null);
  const preselectionApplied = React.useRef(false);

  const selectedProduct = products.find((product) => product.id === productId) ?? null;

  const retry = React.useCallback(() => {
    setStatus("loading");
    setError(null);
    setErrorStatus(null);
    setReloadKey((key) => key + 1);
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
      setProducts(typesRes.data);
      if (!preselectionApplied.current && requestedProduct) {
        const preselected = typesRes.data.find(
          (product) => product.id === requestedProduct || product.name === requestedProduct,
        );
        if (preselected) {
          setProductId(preselected.id);
          setProviderOfferId(requestedOffer || undefined);
        }
        preselectionApplied.current = true;
      }
      setActiveApplication(appsRes.ok ? findActiveApplication(appsRes.data) : null);
      setStatus("ready");
    };
    void run();
    return () => {
      active = false;
    };
  }, [reloadKey, requestedOffer, requestedProduct]);

  // No dedicated product picker anymore: a missing or invalid `?product=`
  // sends the user back to Explore to choose one instead.
  React.useEffect(() => {
    if (status === "ready" && !selectedProduct) {
      router.replace("/dashboard/explore");
    }
  }, [status, selectedProduct, router]);

  function changeProduct() {
    const category = selectedProduct
      ? EXPLORE_CATEGORIES.find((entry) => entry.category === selectedProduct.category)
      : undefined;
    router.push(category ? `/dashboard/explore/${category.slug}` : "/dashboard/explore");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedProduct || !me || submitting) return;
    const errors = validateProductAnswers(selectedProduct, answers);
    setAnswerErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error("Check the highlighted fields before submitting.");
      return;
    }
    if (selectedProduct.category === "loan" && activeApplication) {
      toast.error("You already have a loan application in progress.");
      return;
    }

    setSubmitting(true);
    if (selectedProduct.category !== "loan") {
      const result = await createFinancialServiceEnquiry({
        productId: selectedProduct.id,
        formVersion: selectedProduct.form_version,
        answers,
        providerOfferId,
      });
      setSubmitting(false);
      if (!result.ok) {
        if (result.status === 409) retry();
        toast.error(result.error || "Couldn't submit your enquiry. Please try again.");
        return;
      }
      setSubmittedEnquiryLabel(selectedProduct.label);
      setAnswers({});
      toast.success("Enquiry submitted", {
        description: "A representative will contact you about the next steps.",
      });
      return;
    }

    const result = await createLoanApplication({
      productId: selectedProduct.id,
      formVersion: selectedProduct.form_version,
      answers,
      providerOfferId,
    });
    if (!result.ok) {
      setSubmitting(false);
      if (result.status === 409) retry();
      toast.error(result.error || "Couldn't submit your application. Please try again.");
      return;
    }

    toast.success("Application submitted", {
      description: "We'll be in touch about the next steps.",
    });
    router.push(`/dashboard/loans/${result.data.id}`);
  }

  if (status === "loading" || meStatus === "loading") {
    return (
      <DashboardPage>
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-72 rounded-xl" />
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

  if (!selectedProduct) {
    // Redirecting to Explore (see the effect above) -- render the same
    // loading shell so nothing empty or broken flashes in the meantime.
    return (
      <DashboardPage>
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-72 rounded-xl" />
      </DashboardPage>
    );
  }

  return (
    <DashboardPage>
      <DashboardHeader
        title="Apply for a financial product"
        description="Choose a product and complete the questions configured for it."
      />

      {submittedEnquiryLabel ? (
        <div className="rounded-2xl border border-success/35 bg-success/5 p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" aria-hidden="true" />
            <div>
              <h2 className="font-semibold text-text-primary">{submittedEnquiryLabel} enquiry submitted</h2>
              <p className="mt-1 text-sm text-text-secondary">
                A representative will contact you. You can submit another card or insurance enquiry
                if needed.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {me ? (
        <DashboardPanel
          title={selectedProduct.label}
          description={
            selectedProduct.category === "loan"
              ? "Complete the application details below."
              : "Complete the enquiry details below. This request does not enter the loan sanction or disbursal workflow."
          }
          action={
            <button
              type="button"
              onClick={changeProduct}
              disabled={submitting}
              className="text-sm font-medium text-brand-cta underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              Change product
            </button>
          }
        >
          <form onSubmit={handleSubmit} noValidate className="grid gap-8">
            {providerOfferId ? (
              <div className="rounded-xl border border-brand-cta/30 bg-brand-cta-tint p-4 text-sm text-text-secondary">
                <p className="font-medium text-text-primary">Provider option selected</p>
                <p className="mt-1">
                  We will retain this as your non-binding preference. Final terms and approval
                  remain subject to provider review; staff assignment is handled separately.
                </p>
              </div>
            ) : null}
            <p className="text-xs text-text-secondary">
              Form version {selectedProduct.form_version} · {formatLastUpdated(selectedProduct.last_updated_at)}
            </p>
            <FinancialProductFormFields
              product={selectedProduct}
              fullName={`${me.firstName} ${me.lastName}`.trim()}
              mobile={me.mobile}
              answers={answers}
              errors={answerErrors}
              onAnswersChange={(nextAnswers) => {
                setAnswers(nextAnswers);
                setAnswerErrors((currentErrors) =>
                  Object.keys(currentErrors).length === 0
                    ? currentErrors
                    : validateProductAnswers(selectedProduct, nextAnswers),
                );
              }}
              disabled={submitting}
            />

            <div className="grid gap-2">
              <Button type="submit" disabled={submitting} className="h-12 bg-brand-cta text-base text-white hover:bg-brand-cta-hover focus-visible:ring-brand-cta">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {submitting
                  ? "Submitting…"
                  : selectedProduct.category === "loan"
                    ? "Submit application"
                    : "Submit enquiry"}
              </Button>
            </div>
          </form>
        </DashboardPanel>
      ) : null}
    </DashboardPage>
  );
}
