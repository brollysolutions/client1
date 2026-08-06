"use client";

import * as React from "react";
import { Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { FetchError } from "@/features/dashboard/fetch-error";
import type { FieldVisibilityEntry } from "@/lib/field-visibility-api";

import { useFieldVisibility } from "./use-field-visibility";

const ROLE_LABEL: Record<string, string> = {
  agent: "Agents",
  telecaller: "Telecallers",
  employee: "Employees",
};

const ENTITY_LABEL: Record<string, string> = {
  lead: "Lead",
  loan_application: "Loan application",
  loan_transaction: "Loan transaction",
  property_deal: "Property deal",
};

const MODE_LABEL: Record<string, string> = {
  allow: "Allow",
  deny: "Deny",
  share_link: "Share link",
};

function keyOf(entry: FieldVisibilityEntry): string {
  return `${entry.target_role}:${entry.entity}:${entry.field_key}`;
}

export function FieldVisibilityView() {
  const { entries, loading, error, reload, update } = useFieldVisibility();
  const [saving, setSaving] = React.useState<string | null>(null);

  async function change(entry: FieldVisibilityEntry, mode: string) {
    if (mode === entry.mode || entry.locked) return;
    const key = keyOf(entry);
    setSaving(key);
    const response = await update({
      target_role: entry.target_role,
      entity: entry.entity,
      field_key: entry.field_key,
      mode: mode as FieldVisibilityEntry["mode"],
    });
    setSaving(null);
    if (response.ok) {
      toast.success("Visibility updated", {
        description: `${ROLE_LABEL[entry.target_role]} · ${entry.label}`,
      });
    } else {
      toast.error("Couldn't update visibility", { description: response.error });
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 sm:px-6 lg:px-10">
        <Skeleton className="h-10 w-72 rounded-lg" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10">
        <FetchError status={null} message={error} onRetry={() => void reload()} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-cta-tint text-brand-cta">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Field visibility</h1>
          <p className="mt-1 max-w-3xl text-sm text-text-secondary">
            Control which supported fields reach Agent, Telecaller, and Employee API responses.
            Changes apply on their next request and are recorded in the activity log.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
            <tr>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">Record</th>
              <th className="px-5 py-3 font-medium">Field</th>
              <th className="px-5 py-3 font-medium">Visibility</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const key = keyOf(entry);
              return (
                <tr key={key} className="border-b border-border last:border-0">
                  <td className="px-5 py-4 font-medium text-text-primary">
                    {ROLE_LABEL[entry.target_role] ?? entry.target_role}
                  </td>
                  <td className="px-5 py-4 text-text-secondary">
                    {ENTITY_LABEL[entry.entity] ?? entry.entity}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-text-primary">{entry.label}</span>
                      {entry.locked ? (
                        <Badge variant="outline" title={entry.lock_reason ?? undefined}>
                          <LockKeyhole className="mr-1 h-3 w-3" aria-hidden="true" />
                          Required
                        </Badge>
                      ) : null}
                    </div>
                    {entry.locked && entry.lock_reason ? (
                      <p className="mt-1 max-w-xl text-xs text-text-secondary">
                        {entry.lock_reason}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <Select
                        value={entry.mode}
                        disabled={entry.locked || saving === key}
                        onValueChange={(value) => void change(entry, value)}
                      >
                        <SelectTrigger
                          className="w-40"
                          aria-label={`Visibility for ${ROLE_LABEL[entry.target_role]} ${entry.label}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {entry.allowed_modes.map((mode) => (
                            <SelectItem key={mode} value={mode}>
                              {MODE_LABEL[mode] ?? mode}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {saving === key ? (
                        <Loader2 className="h-4 w-4 animate-spin text-text-secondary" aria-hidden />
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-text-secondary">
        Share link is provider-neutral: it creates an expiring platform invitation for native
        browser sharing or copying. It does not call a messaging or WhatsApp API.
      </p>
    </div>
  );
}
