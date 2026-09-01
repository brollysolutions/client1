"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSubmission, type Submission } from "@/lib/property-submissions-api";
import { SubmitPropertyForm } from "./submit-property-form";

export function EditPropertyForm({
  submissionId,
  adminCorrection = false,
}: {
  submissionId: string;
  adminCorrection?: boolean;
}) {
  const [submission, setSubmission] = React.useState<Submission | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [retry, setRetry] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setSubmission(null);
    setError(null);
    void getSubmission(submissionId).then((result) => {
      if (cancelled) return;
      if (result.ok) setSubmission(result.data);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [retry, submissionId]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <p className="text-sm text-text-secondary">{error}</p>
        <Button className="mt-4" variant="outline" onClick={() => setRetry((value) => value + 1)}>
          Try again
        </Button>
      </div>
    );
  }
  if (!submission) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-label="Loading listing" />
      </div>
    );
  }
  return <SubmitPropertyForm submission={submission} adminCorrection={adminCorrection} />;
}
