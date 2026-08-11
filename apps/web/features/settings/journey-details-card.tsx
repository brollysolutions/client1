"use client";

import * as React from "react";
import { FilePenLine, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useLine } from "@/features/dashboard/line-provider";
import {
  getClientLeadDetails,
  updateClientLeadDetails,
  type LeadDetails,
  type LeadDetailsPatch,
} from "@/lib/lead-details-api";

const OWNER_LABEL: Record<string, string> = {
  agent: "Agent supplied",
  client: "You supplied",
  telecaller: "Telecaller supplied",
  admin: "Admin supplied",
  system: "System managed",
  unclaimed: "Unclaimed",
  legacy_locked: "Legacy record",
};

function notesFrom(details: LeadDetails): string {
  const notes = details.requirement?.notes;
  return typeof notes === "string" ? notes : "";
}

function OwnerBadge({ owner }: { owner?: string }) {
  return <Badge variant="outline">{owner ? OWNER_LABEL[owner] ?? owner : "Not supplied"}</Badge>;
}

export function JourneyDetailsCard() {
  const { activeLine } = useLine();
  const [details, setDetails] = React.useState<LeadDetails | null>(null);
  const [name, setName] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const requestId = React.useRef(0);

  const load = React.useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setSaving(false);
    setError(null);
    const result = await getClientLeadDetails(activeLine);
    if (currentRequest !== requestId.current) return;
    setLoading(false);
    if (!result.ok) {
      setDetails(null);
      setError(result.error);
      return;
    }
    setDetails(result.data);
    setName(result.data.name ?? "");
    setNotes(notesFrom(result.data));
  }, [activeLine]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Skeleton className="h-72 rounded-xl" />;

  if (error || !details) {
    return (
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold text-text-primary">Journey details</h2>
        <p className="mt-2 text-sm text-text-secondary">
          {error ?? "No journey details are available for this business line."}
        </p>
        <Button type="button" variant="outline" className="mt-4" onClick={() => void load()}>
          Try again
        </Button>
      </section>
    );
  }

  const canEditName = details.editable_fields.includes("name");
  const canEditNotes = details.editable_fields.includes("requirement.notes");
  const normalizedName = name.trim() || null;
  const normalizedNotes = notes.trim() || null;
  const nameChanged = canEditName && normalizedName !== details.name;
  const notesChanged = canEditNotes && normalizedNotes !== (notesFrom(details) || null);
  const canSave = (nameChanged || notesChanged) && !saving;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!details || !canSave) return;
    const payload: LeadDetailsPatch = {};
    if (nameChanged) payload.name = normalizedName;
    if (notesChanged) payload.notes = normalizedNotes;

    const currentRequest = ++requestId.current;
    setSaving(true);
    const result = await updateClientLeadDetails(activeLine, payload);
    if (currentRequest !== requestId.current) return;
    setSaving(false);
    if (!result.ok) {
      toast.error("Could not update journey details", { description: result.error });
      if (result.status === 403 || result.status === 409) void load();
      return;
    }
    setDetails(result.data);
    setName(result.data.name ?? "");
    setNotes(notesFrom(result.data));
    toast.success("Journey details updated");
  }

  return (
    <form onSubmit={save} className="space-y-5 rounded-xl border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <FilePenLine className="mt-0.5 h-5 w-5 text-brand-blue" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Journey details</h2>
          <p className="mt-1 text-sm text-text-secondary">
            You can correct details you supplied. Details supplied by an Agent stay with that
            Agent, and operational updates are recorded separately.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="journey-name">Lead name</Label>
          <OwnerBadge owner={details.field_owners.name} />
        </div>
        <Input
          id="journey-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!canEditName || saving}
          maxLength={100}
          autoComplete="name"
        />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="journey-notes">Journey notes</Label>
          <OwnerBadge owner={details.field_owners["requirement.notes"]} />
        </div>
        <Textarea
          id="journey-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          disabled={!canEditNotes || saving}
          maxLength={1000}
          rows={4}
          placeholder="Add information that will help us understand your requirement."
        />
      </div>

      {!canEditName && !canEditNotes ? (
        <p className="text-xs text-text-secondary">
          These fields are read-only because another creator supplied them or this journey is
          complete.
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={!canSave}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save journey details
        </Button>
      </div>
    </form>
  );
}
