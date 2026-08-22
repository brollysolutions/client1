"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  submitProperty,
  updateSubmission,
  uploadPropertyMedia,
  type Submission,
} from "@/lib/property-submissions-api";
import {
  buildSubmissionPayload,
  buildSubmissionUpdatePayload,
  validateForm,
  EMPTY_FORM,
  submissionToFormState,
  type PropertyDetailForm,
  type SubmitFormState,
} from "@/lib/property-submit";

export function useSubmitProperty(submission?: Submission) {
  const router = useRouter();
  const [form, setForm] = React.useState<SubmitFormState>(() =>
    submission ? submissionToFormState(submission) : EMPTY_FORM,
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<string | null>(null);

  const setField = React.useCallback(
    <K extends keyof SubmitFormState>(field: K, value: SubmitFormState[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const setDetailField = React.useCallback(
    <K extends keyof PropertyDetailForm>(field: K, value: PropertyDetailForm[K]) => {
      setForm((prev) => ({ ...prev, details: { ...prev.details, [field]: value } }));
    },
    [],
  );

  const addAmenity = React.useCallback((value: string) => {
    const v = value.trim();
    if (v === "") return;
    setForm((prev) =>
      prev.amenities.includes(v) ? prev : { ...prev, amenities: [...prev.amenities, v] },
    );
  }, []);
  const removeAmenity = React.useCallback((value: string) => {
    setForm((prev) => ({ ...prev, amenities: prev.amenities.filter((a) => a !== value) }));
  }, []);

  const setImages = React.useCallback((images: File[]) => {
    setForm((prev) => ({ ...prev, images }));
  }, []);
  const setDocuments = React.useCallback((documents: File[]) => {
    setForm((prev) => ({ ...prev, documents }));
  }, []);
  const setPanorama = React.useCallback((panorama: File | null) => {
    setForm((prev) => ({ ...prev, panorama }));
  }, []);

  const submit = React.useCallback(async () => {
    const found = validateForm(form, { requireImages: submission == null });
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setSubmitting(true);
    if (submission) {
      setUploadProgress("Saving changes");
      const res = await updateSubmission(submission.id, buildSubmissionUpdatePayload(form));
      setSubmitting(false);
      setUploadProgress(null);
      if (res.ok) {
        toast.success(
          submission.status === "approved"
            ? "Changes sent for Admin review. The approved version remains public."
            : "Listing changes saved for review.",
        );
        router.push("/dashboard/my-submissions");
      } else {
        toast.error(res.error || "Could not update the listing.");
      }
      return;
    }
    const totalUploads = form.images.length + form.documents.length + (form.panorama ? 1 : 0);
    setUploadProgress(`Uploading 0 of ${totalUploads}`);
    const uploaded = await uploadPropertyMedia(
      form.images,
      form.documents,
      form.panorama,
      (done, total) => setUploadProgress(`Uploading ${done} of ${total}`),
    );
    if (!uploaded.ok) {
      setSubmitting(false);
      setUploadProgress(null);
      toast.error(uploaded.error);
      return;
    }
    setUploadProgress("Saving submission");
    const res = await submitProperty(buildSubmissionPayload(form, uploaded.media));
    setSubmitting(false);
    setUploadProgress(null);
    if (res.ok) {
      toast.success("Listing submitted for review.");
      router.push("/dashboard/my-submissions");
    } else {
      toast.error(res.error || "Could not submit the listing.");
    }
  }, [form, router, submission]);

  return {
    form,
    setField,
    setDetailField,
    addAmenity,
    removeAmenity,
    setImages,
    setDocuments,
    setPanorama,
    editing: submission != null,
    existingMedia: submission?.media ?? [],
    errors,
    submitting,
    uploadProgress,
    submit,
  };
}
