"use client";

import * as React from "react";
import { FileCheck2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DOC_TYPE_LABEL, type DocTypeValue } from "@/lib/doc-types";
import type { DocumentSubject, VerifiableDocument } from "@/lib/admin-document-verification-api";

import { useAdminDocumentVerification } from "./use-admin-document-verification";

const LINE_LABEL: Record<string, string> = { loans: "Loans", real_estate: "Real Estate" };
const SOURCE_LABEL: Record<string, string> = {
  task: "field task",
  loan_application: "client upload",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

type LeadGroup = {
  leadUuid: string;
  leadName: string | null;
  leadMobileMasked: string;
  businessLine: string;
  subjects: DocumentSubject[];
};

function groupByLead(subjects: DocumentSubject[]): LeadGroup[] {
  const groups = new Map<string, LeadGroup>();
  for (const s of subjects) {
    const existing = groups.get(s.lead_uuid);
    if (existing) {
      existing.subjects.push(s);
    } else {
      groups.set(s.lead_uuid, {
        leadUuid: s.lead_uuid,
        leadName: s.lead_name,
        leadMobileMasked: s.lead_mobile_masked,
        businessLine: s.business_line,
        subjects: [s],
      });
    }
  }
  return Array.from(groups.values()).sort(
    (a, b) =>
      Math.max(...b.subjects.map((s) => new Date(s.latest_upload_at).getTime())) -
      Math.max(...a.subjects.map((s) => new Date(s.latest_upload_at).getTime())),
  );
}

export function DocumentVerificationView() {
  const {
    subjects,
    loading,
    error,
    onlyUnverified,
    setOnlyUnverified,
    reload,
    documentsBySubject,
    documentsLoading,
    loadDocuments,
    setVerification,
    subjectKey,
  } = useAdminDocumentVerification();

  const [activeSubject, setActiveSubject] = React.useState<DocumentSubject | null>(null);
  const [noteDraftByDoc, setNoteDraftByDoc] = React.useState<Record<string, string>>({});
  const [busyDocId, setBusyDocId] = React.useState<string | null>(null);

  function openSubject(subject: DocumentSubject) {
    setActiveSubject(subject);
    void loadDocuments(subject.source, subject.subject_uuid);
  }

  function closeSubject() {
    setActiveSubject(null);
  }

  async function handleVerify(doc: VerifiableDocument, verified: boolean) {
    if (!activeSubject) return;
    const note = noteDraftByDoc[doc.document_id]?.trim() || null;
    if (!verified && !note) {
      toast.error("A note is required when marking a document unverified.");
      return;
    }
    setBusyDocId(doc.document_id);
    const res = await setVerification(
      doc.source,
      doc.document_id,
      { verified, review_note: note },
      activeSubject.subject_uuid,
    );
    setBusyDocId(null);
    if (res.ok) {
      toast.success(verified ? "Marked verified" : "Sent back for re-collection");
    } else {
      toast.error("Couldn't update this document", { description: res.error });
    }
  }

  const groups = groupByLead(subjects);
  const activeKey = activeSubject
    ? subjectKey(activeSubject.source, activeSubject.subject_uuid)
    : null;
  const activeDocuments = activeKey ? documentsBySubject[activeKey] : undefined;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Document verification</h1>
        <p className="text-sm text-text-secondary">
          Confirm the documents collected in the field and uploaded by clients are complete and
          usable.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="only-unverified"
          checked={onlyUnverified}
          onCheckedChange={(checked) => setOnlyUnverified(checked === true)}
        />
        <label htmlFor="only-unverified" className="text-sm text-text-secondary">
          Needs review only
        </label>
      </div>

      {error ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-text-secondary">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-border bg-card py-16">
          <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-hidden="true" />
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-12 text-center">
          <FileCheck2 className="h-8 w-8 text-text-secondary" aria-hidden="true" />
          <p className="mt-3 font-medium text-text-primary">
            {onlyUnverified ? "Nothing is waiting for review." : "No documents found."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {groups.map((group) => (
            <li
              key={group.leadUuid}
              className="rounded-2xl border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-text-primary">
                  {group.leadName ?? "Unknown lead"}
                </span>
                <span className="text-sm text-text-secondary">{group.leadMobileMasked}</span>
                <Badge className="bg-muted text-text-secondary">
                  {LINE_LABEL[group.businessLine] ?? group.businessLine}
                </Badge>
              </div>
              <ul className="mt-3 space-y-2">
                {group.subjects.map((subject) => (
                  <li key={`${subject.source}:${subject.subject_uuid}`}>
                    <button
                      type="button"
                      onClick={() => openSubject(subject)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-left transition hover:border-brand-cta"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-text-primary">
                          {subject.subject_label}
                        </span>
                        <span className="text-xs text-text-secondary">
                          {SOURCE_LABEL[subject.source] ?? subject.source} ·{" "}
                          {formatDate(subject.latest_upload_at)}
                        </span>
                      </span>
                      <Badge
                        className={
                          subject.verified_count === subject.total_count
                            ? "bg-success/10 text-success"
                            : "bg-warning/10 text-warning"
                        }
                      >
                        {subject.verified_count} of {subject.total_count} verified
                      </Badge>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={activeSubject !== null} onOpenChange={(o) => !o && closeSubject()}>
        <DialogContent className="max-w-xl">
          {activeSubject ? (
            <>
              <DialogHeader>
                <DialogTitle>{activeSubject.subject_label}</DialogTitle>
                <DialogDescription>
                  {activeSubject.lead_name ?? "Unknown lead"} · {activeSubject.lead_mobile_masked}
                </DialogDescription>
              </DialogHeader>

              {documentsLoading === activeKey ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-brand-navy" aria-hidden="true" />
                </div>
              ) : !activeDocuments || activeDocuments.length === 0 ? (
                <p className="py-6 text-center text-sm text-text-secondary">
                  No documents found for this subject.
                </p>
              ) : (
                <ul className="space-y-3">
                  {activeDocuments.map((doc) => (
                    <li
                      key={doc.document_id}
                      className="rounded-xl border border-border p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <a
                            href={doc.download_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-medium text-text-primary hover:underline"
                          >
                            {DOC_TYPE_LABEL[doc.doc_type as DocTypeValue] ?? doc.doc_type}
                          </a>
                          <p className="text-xs text-text-secondary">
                            Uploaded {formatDate(doc.uploaded_at)}
                          </p>
                        </div>
                        {doc.verified ? (
                          <Badge className="bg-success/10 text-success">Verified</Badge>
                        ) : (
                          <Badge className="bg-warning/10 text-warning">Needs review</Badge>
                        )}
                      </div>
                      {doc.review_note ? (
                        <p className="mt-2 text-xs text-text-secondary">
                          Note: {doc.review_note}
                        </p>
                      ) : null}
                      <div className="mt-3 space-y-2">
                        <Textarea
                          value={noteDraftByDoc[doc.document_id] ?? ""}
                          onChange={(e) =>
                            setNoteDraftByDoc((prev) => ({
                              ...prev,
                              [doc.document_id]: e.target.value,
                            }))
                          }
                          placeholder="Note (required if sending back for re-collection)"
                          rows={2}
                          maxLength={1000}
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyDocId === doc.document_id}
                            onClick={() => void handleVerify(doc, false)}
                          >
                            Needs re-collect
                          </Button>
                          <Button
                            size="sm"
                            disabled={busyDocId === doc.document_id || doc.verified}
                            onClick={() => void handleVerify(doc, true)}
                          >
                            {busyDocId === doc.document_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : null}
                            Verify
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={closeSubject}>
                  Close
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
