"use client";

import * as React from "react";
import { Loader2, PencilLine } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getAdminLeadDetails,
  updateAdminLeadDetails,
  type AdminLeadDetailsPatch,
  type LeadDetails,
} from "@/lib/lead-details-api";

const OWNER_LABEL: Record<string, string> = {
  agent: "Agent",
  client: "Client",
  telecaller: "Telecaller",
  admin: "Admin",
  system: "System",
  unclaimed: "Unclaimed",
  legacy_locked: "Legacy locked",
};

function notesFrom(details: LeadDetails): string {
  const notes = details.requirement?.notes;
  return typeof notes === "string" ? notes : "";
}

function OwnershipBadge({ owner }: { owner?: string }) {
  return <Badge variant="outline">Owner: {owner ? OWNER_LABEL[owner] ?? owner : "None"}</Badge>;
}

export function LeadDetailsDialog({
  leadId,
  leadName,
  onSaved,
}: {
  leadId: string;
  leadName: string | null;
  onSaved?: () => void;
}) {
  const nameId = React.useId();
  const notesId = React.useId();
  const reasonId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [details, setDetails] = React.useState<LeadDetails | null>(null);
  const [name, setName] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getAdminLeadDetails(leadId);
    setLoading(false);
    if (!result.ok) {
      setDetails(null);
      setError(result.error);
      return;
    }
    setDetails(result.data);
    setName(result.data.name ?? "");
    setNotes(notesFrom(result.data));
    setReason("");
  }, [leadId]);

  React.useEffect(() => {
    if (open) void load();
  }, [load, open]);

  const normalizedName = name.trim() || null;
  const normalizedNotes = notes.trim() || null;
  const nameChanged = details !== null && normalizedName !== details.name;
  const notesChanged = details !== null && normalizedNotes !== (notesFrom(details) || null);
  const canSave = (nameChanged || notesChanged) && reason.trim().length > 0 && !saving;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!details || !canSave) return;
    const payload: AdminLeadDetailsPatch = { reason: reason.trim() };
    if (nameChanged) payload.name = normalizedName;
    if (notesChanged) payload.notes = normalizedNotes;

    setSaving(true);
    const result = await updateAdminLeadDetails(leadId, payload);
    setSaving(false);
    if (!result.ok) {
      toast.error("Could not correct lead details", { description: result.error });
      return;
    }
    toast.success("Lead details corrected", {
      description: "The original field ownership was preserved and the reason was audited.",
    });
    setOpen(false);
    onSaved?.();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <PencilLine className="h-4 w-4" />
          Correct details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Correct lead details</DialogTitle>
          <DialogDescription>
            {leadName ?? "Unnamed lead"}. Admin corrections keep the original creator ownership and
            require an audit reason.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-brand-navy" aria-label="Loading" />
          </div>
        ) : error || !details ? (
          <div className="rounded-lg border border-border p-4 text-sm text-text-secondary">
            <p>{error ?? "Lead details are unavailable."}</p>
            <Button type="button" variant="outline" className="mt-3" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={nameId}>Lead name</Label>
                <OwnershipBadge owner={details.field_owners.name} />
              </div>
              <Input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={notesId}>Journey notes</Label>
                <OwnershipBadge owner={details.field_owners["requirement.notes"]} />
              </div>
              <Textarea
                id={notesId}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={1000}
                rows={4}
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={reasonId}>Correction reason</Label>
              <Textarea
                id={reasonId}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                rows={3}
                required
                disabled={saving}
                placeholder="Record how this correction was verified. Do not include unnecessary personal data."
              />
              <p className="text-xs text-text-secondary">
                The reason and changed field names are written to the audit log; field values are
                not copied there.
              </p>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={!canSave}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save correction
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
