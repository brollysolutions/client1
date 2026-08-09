"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { submitProperty, uploadPropertyMedia } from "@/lib/property-submissions-api";
import {
  buildSubmissionPayload,
  validateForm,
  EMPTY_FORM,
  type DetailRow,
  type SubmitFormState,
} from "@/lib/property-submit";

export function useSubmitProperty() {
  const router = useRouter();
  const [form, setForm] = React.useState<SubmitFormState>(EMPTY_FORM);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState<string | null>(null);

  const setField = React.useCallback(
    <K extends keyof SubmitFormState>(field: K, value: SubmitFormState[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const addDetailRow = React.useCallback(() => {
    setForm((prev) => ({ ...prev, details: [...prev.details, { key: "", value: "" }] }));
  }, []);
  const setDetailRow = React.useCallback((i: number, row: DetailRow) => {
    setForm((prev) => ({ ...prev, details: prev.details.map((r, idx) => (idx === i ? row : r)) }));
  }, []);
  const removeDetailRow = React.useCallback((i: number) => {
    setForm((prev) => ({ ...prev, details: prev.details.filter((_, idx) => idx !== i) }));
  }, []);

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
  const setVideo = React.useCallback((video: File | null) => {
    setForm((prev) => ({ ...prev, video }));
  }, []);

  const submit = React.useCallback(async () => {
    const found = validateForm(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setSubmitting(true);
    const totalUploads = form.images.length + form.documents.length + (form.video ? 1 : 0);
    setUploadProgress(`Uploading 0 of ${totalUploads}`);
    const uploaded = await uploadPropertyMedia(
      form.images,
      form.documents,
      form.video,
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
  }, [form, router]);

  return {
    form,
    setField,
    addDetailRow,
    setDetailRow,
    removeDetailRow,
    addAmenity,
    removeAmenity,
    setImages,
    setDocuments,
    setVideo,
    errors,
    submitting,
    uploadProgress,
    submit,
  };
}
