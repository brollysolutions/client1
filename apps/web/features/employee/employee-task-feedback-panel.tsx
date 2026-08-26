"use client";

import * as React from "react";
import Image from "next/image";
import { Camera, Download, FileText, ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DashboardPanel } from "@/features/dashboard/dashboard-ui";

import { useEmployeeTaskFeedback } from "./use-employee-task-feedback";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const CAMERA_ACCEPT = "image/jpeg,image/png,image/webp";

export function EmployeeTaskFeedbackPanel({ taskId, disabled }: { taskId: string; disabled: boolean }) {
  const { items, loading, error, uploading, deletingId, upload, remove, reload } =
    useEmployeeTaskFeedback(taskId);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);

  async function chosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const result = await upload(file);
    if (result.ok) toast.success("Visit feedback attached");
    else toast.error("Couldn’t attach feedback", { description: result.error });
  }

  return (
    <DashboardPanel
      title="Visit feedback"
      description="Private photos or PDFs for Admin review. Up to 5 attachments, 5 MiB each."
      action={
        !disabled ? (
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(event) => void chosen(event)} />
            <input ref={cameraRef} type="file" accept={CAMERA_ACCEPT} capture="environment" className="hidden" onChange={(event) => void chosen(event)} />
            <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Attach
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => cameraRef.current?.click()}>
              <Camera className="h-4 w-4" /> Photo
            </Button>
          </div>
        ) : undefined
      }
    >
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : error ? (
        <div className="text-sm text-destructive">
          {error} <button type="button" className="underline" onClick={reload}>Try again</button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-secondary">No feedback attachments yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item, index) => (
            <li key={item.id} className="overflow-hidden rounded-xl border border-border">
              {item.preview_url ? (
                <a href={item.preview_url} target="_blank" rel="noreferrer" className="relative block aspect-video bg-muted">
                  <Image src={item.preview_url} alt={`Visit feedback ${index + 1}`} fill unoptimized className="object-cover" />
                </a>
              ) : (
                <div className="flex aspect-video items-center justify-center bg-muted">
                  {item.kind === "image" ? <ImageIcon className="h-7 w-7" /> : <FileText className="h-7 w-7" />}
                </div>
              )}
              <div className="flex gap-2 p-3">
                <Button asChild size="sm" variant="outline" className="flex-1">
                  <a href={item.download_url} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /> Download</a>
                </Button>
                {!disabled ? (
                  <Button type="button" size="sm" variant="outline" disabled={deletingId === item.id} aria-label={`Remove feedback ${index + 1}`} onClick={() => void remove(item.id).then((result) => result.ok ? toast.success("Feedback removed") : toast.error("Couldn’t remove feedback", { description: result.error }))}>
                    {deletingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashboardPanel>
  );
}
