"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardPanel } from "@/features/dashboard/dashboard-ui";
import {
  PropertyDealProgressControls,
  STATUS_LABEL,
} from "@/features/property-deals/property-deal-progress-controls";
import { getProperties } from "@/lib/properties-api";
import type { PropertyDealProgressUpdate, TelecallerPropertyDeal } from "@/lib/telecaller-api";
import type { ApiResponse } from "@/lib/api/client";
import type { REListing } from "@/lib/real-estate";

function CreateDealForm({
  leadId,
  onCreate,
}: {
  leadId: string;
  onCreate: (propertyId: string) => Promise<ApiResponse<unknown>>;
}) {
  const [properties, setProperties] = React.useState<REListing[]>([]);
  const [loadingProperties, setLoadingProperties] = React.useState(true);
  const [propertyId, setPropertyId] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    void getProperties().then((res) => {
      if (!active) return;
      if (res.ok) setProperties(res.data);
      setLoadingProperties(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!propertyId) {
      toast.error("Choose a property");
      return;
    }
    setSaving(true);
    const res = await onCreate(propertyId);
    setSaving(false);
    if (res.ok) {
      toast.success("Deal opened");
      setPropertyId("");
    } else {
      toast.error("Couldn't open a deal", { description: (res as { error?: string }).error });
    }
  }

  return (
    <form
      className="mt-4 flex flex-wrap items-end gap-3"
      onSubmit={(e) => void onSubmit(e)}
      aria-label={`Open a property deal for lead ${leadId}`}
    >
      <div className="min-w-56 flex-1">
        <Label htmlFor="deal-property">Property</Label>
        <Select value={propertyId} onValueChange={setPropertyId} disabled={loadingProperties}>
          <SelectTrigger id="deal-property" className="w-full">
            <SelectValue
              placeholder={loadingProperties ? "Loading properties..." : "Choose a property"}
            />
          </SelectTrigger>
          <SelectContent>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.title} · {p.location}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" size="sm" disabled={saving || loadingProperties}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Open deal
      </Button>
    </form>
  );
}

export function TelecallerPropertyDealsSection({
  leadId,
  deals,
  onCreateDeal,
  onUpdateDeal,
}: {
  leadId: string;
  deals: TelecallerPropertyDeal[];
  onCreateDeal: (propertyId: string) => Promise<ApiResponse<unknown>>;
  onUpdateDeal: (
    dealId: string,
    payload: PropertyDealProgressUpdate,
  ) => Promise<ApiResponse<unknown>>;
}) {
  return (
    <DashboardPanel title="Property deals">
      {deals.length === 0 ? (
        <p className="text-sm text-text-secondary">No property deal opened on this lead yet.</p>
      ) : (
        <div className="space-y-5">
          {deals.map((deal) => (
            <div key={deal.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-text-primary">{deal.property_title}</p>
                  <p className="text-sm text-text-secondary">{deal.property_location}</p>
                </div>
                <Badge variant="secondary">{STATUS_LABEL[deal.status]}</Badge>
              </div>
              <PropertyDealProgressControls
                deal={deal}
                onUpdate={(payload) => onUpdateDeal(deal.id, payload)}
              />
            </div>
          ))}
        </div>
      )}

      <CreateDealForm leadId={leadId} onCreate={onCreateDeal} />
    </DashboardPanel>
  );
}
