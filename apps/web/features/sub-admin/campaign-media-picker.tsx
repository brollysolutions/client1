"use client";

import * as React from "react";
import Link from "next/link";
import { Images, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  listCampaignMedia,
  type CampaignMediaAsset,
} from "@/lib/campaign-media-api";

export function CampaignMediaPicker({
  usageType,
  businessLine,
  value,
  onChange,
  label = "Media Library artwork",
}: {
  usageType: "dashboard_banner" | "dashboard_offer";
  businessLine: "loans" | "real_estate" | "both";
  value: string;
  onChange: (id: string, asset: CampaignMediaAsset | null) => void;
  label?: string;
}) {
  const [assets, setAssets] = React.useState<CampaignMediaAsset[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const onChangeRef = React.useRef(onChange);

  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void listCampaignMedia({ businessLine }).then((response) => {
      if (!active) return;
      setLoading(false);
      if (response.ok) {
        const nextAssets = response.data.filter(
          (asset) => asset.usage_type === usageType || asset.usage_type === "campaign",
        );
        setAssets(nextAssets);
      } else {
        setAssets([]);
        setError(response.error);
      }
    });
    return () => { active = false; };
  }, [businessLine, refreshKey, usageType]);

  const visibleAssets = React.useMemo(
    () => assets.filter((asset) => asset.active || asset.id === value),
    [assets, value],
  );

  React.useEffect(() => {
    if (!loading && !error && value && !assets.some((asset) => asset.id === value)) {
      onChangeRef.current("", null);
    }
  }, [assets, error, loading, value]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>{label}</Label>
        <Button asChild variant="ghost" size="sm"><Link href="/dashboard/media-library"><Images className="h-4 w-4" />Open library</Link></Button>
      </div>
      {loading ? <div className="grid h-24 place-items-center rounded-xl border border-dashed border-border"><Loader2 className="h-5 w-5 animate-spin text-brand-blue" /></div> : error ? (
        <div role="alert" className="flex min-h-24 flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <span>Media Library could not load. {error}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setRefreshKey((key) => key + 1)}>Retry</Button>
        </div>
      ) : visibleAssets.length ? (
        <div role="radiogroup" aria-label={label} className="grid max-h-64 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
          {visibleAssets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              role="radio"
              aria-checked={value === asset.id}
              disabled={!asset.active}
              onClick={() => onChange(asset.id, asset)}
              className={`overflow-hidden rounded-xl border bg-card text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70 ${value === asset.id ? "border-[var(--nav-primary)] ring-2 ring-[var(--nav-primary)]/20" : "border-border hover:border-[var(--nav-primary)]/40"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset.image_url} alt="" width={480} height={240} className="aspect-[2/1] w-full object-cover" />
              <span className="flex items-center justify-between gap-2 px-2 py-2 text-xs font-medium"><span className="truncate">{asset.title}</span>{!asset.active ? <span className="shrink-0 text-[10px] uppercase text-text-secondary">Archived</span> : null}</span>
            </button>
          ))}
        </div>
      ) : <div className="rounded-xl border border-dashed border-border p-4 text-sm text-text-secondary">No matching reusable artwork yet. Add one in the Media Library.</div>}
    </div>
  );
}
