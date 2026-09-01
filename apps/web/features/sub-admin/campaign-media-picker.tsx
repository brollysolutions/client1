"use client";
/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Check, Images, Loader2, Search, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ARTWORK_SURFACES,
  fitsSurface,
  formatTargetSize,
  surfaceFor,
  type ArtworkUsageType,
} from "@/lib/campaign-artwork";
import { listCampaignMedia, type CampaignMediaAsset } from "@/lib/campaign-media-api";
import { cn } from "@/lib/utils";

import { ArtworkUploadDialog } from "./artwork-upload-dialog";

type BusinessLine = "loans" | "real_estate" | "both";

/**
 * Artwork chooser for one campaign surface.
 *
 * Two things this replaces mattered. Every tile used to be force-cropped to
 * 2:1, so a 9:5 hero and a 16:9 sponsor looked identical and a Sub Admin could
 * not tell what they were picking; tiles now render at the target shape and
 * flag artwork that does not fit it. And uploading meant leaving the form for
 * the Media Library page and coming back, so a device upload now happens here
 * and selects itself.
 */
export function CampaignMediaPicker({
  usageTypes,
  businessLine,
  value,
  onChange,
  label = "Artwork",
  invalid = false,
  describedBy,
}: {
  /** Usage types this surface accepts; the first is the upload default. */
  usageTypes: readonly ArtworkUsageType[];
  businessLine: BusinessLine;
  value: string;
  onChange: (id: string, asset: CampaignMediaAsset | null) => void;
  label?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [assets, setAssets] = React.useState<CampaignMediaAsset[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const onChangeRef = React.useRef(onChange);

  const primaryUsage = usageTypes[0];
  const surface = ARTWORK_SURFACES[primaryUsage];
  // Set membership, not array identity: a fresh array literal from the parent
  // would otherwise refetch on every keystroke.
  const usageKey = [...usageTypes].sort().join(",");

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
      if (!response.ok) {
        setAssets([]);
        setError(response.error);
        return;
      }
      const allowed = new Set(usageKey.split(","));
      setAssets(response.data.filter((asset) => allowed.has(asset.usage_type)));
    });
    return () => {
      active = false;
    };
  }, [businessLine, refreshKey, usageKey]);

  // Artwork that vanished from the allowed set (placement changed, asset
  // archived) must not stay silently selected on a form the author will submit.
  React.useEffect(() => {
    if (!loading && !error && value && !assets.some((asset) => asset.id === value)) {
      onChangeRef.current("", null);
    }
  }, [assets, error, loading, value]);

  const visible = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return assets.filter(
      (asset) =>
        (asset.active || asset.id === value) &&
        (!needle ||
          [asset.title, asset.alt_text, ...asset.tags].join(" ").toLowerCase().includes(needle)),
    );
  }, [assets, search, value]);

  const readyMade = visible.filter((asset) => asset.source_type === "bundled");
  const uploaded = visible.filter((asset) => asset.source_type !== "bundled");

  function select(asset: CampaignMediaAsset) {
    onChange(asset.id, asset);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Label>{label}</Label>
          <p className="mt-0.5 text-xs text-text-secondary">
            {surface.description} · {formatTargetSize(surface)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4" aria-hidden />
            Upload from device
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/media-library">
              <Images className="h-4 w-4" aria-hidden />
              Library
            </Link>
          </Button>
        </div>
      </div>

      <Label className="relative block">
        <span className="sr-only">Search artwork</span>
        <Search
          className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-text-secondary"
          aria-hidden
        />
        <Input
          type="search"
          name="artwork_search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="pl-9"
          placeholder="Search artwork by title or tag"
        />
      </Label>

      <div
        className={cn(
          "space-y-5 rounded-xl border p-4",
          invalid ? "border-red-300 bg-red-50/40" : "border-border bg-card",
        )}
      >
        {loading ? (
          <div className="grid min-h-40 place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-brand-blue" aria-hidden />
            <span className="sr-only">Loading artwork</span>
          </div>
        ) : error ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          >
            <span>Artwork could not load. {error}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRefreshKey((key) => key + 1)}
            >
              Retry
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <div className="grid min-h-40 place-items-center rounded-lg border border-dashed border-border p-6 text-center">
            <div>
              <Images className="mx-auto h-7 w-7 text-text-secondary" aria-hidden />
              <p className="mt-3 text-sm font-medium text-text-primary">
                {search ? "No artwork matches that search" : "No artwork for this surface yet"}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                Upload a {formatTargetSize(surface)} image to get started.
              </p>
            </div>
          </div>
        ) : (
          <>
            <ArtworkGroup
              heading="Ready-made artwork"
              hint="Reviewed images that ship with the platform"
              assets={readyMade}
              value={value}
              onSelect={select}
              usageTypes={usageTypes}
              invalid={invalid}
              describedBy={describedBy}
            />
            <ArtworkGroup
              heading="Uploaded artwork"
              hint="Images your team added to the library"
              assets={uploaded}
              value={value}
              onSelect={select}
              usageTypes={usageTypes}
              invalid={invalid}
              describedBy={describedBy}
            />
          </>
        )}
      </div>

      <ArtworkUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        fixedUsageType={primaryUsage}
        defaultBusinessLine={businessLine}
        onUploaded={(asset) => {
          setAssets((current) => [asset, ...current]);
          onChange(asset.id, asset);
        }}
      />
    </div>
  );
}

function ArtworkGroup({
  heading,
  hint,
  assets,
  value,
  onSelect,
  usageTypes,
  invalid,
  describedBy,
}: {
  heading: string;
  hint: string;
  assets: CampaignMediaAsset[];
  value: string;
  onSelect: (asset: CampaignMediaAsset) => void;
  usageTypes: readonly ArtworkUsageType[];
  invalid?: boolean;
  describedBy?: string;
}) {
  if (assets.length === 0) return null;
  const surface = ARTWORK_SURFACES[usageTypes[0]];
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-semibold text-text-primary">{heading}</h4>
        <span className="text-xs text-text-secondary">{assets.length}</span>
      </div>
      <p className="-mt-2 text-xs text-text-secondary">{hint}</p>
      <div
        role="radiogroup"
        aria-label={heading}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
      >
        {assets.map((asset) => {
          const selected = value === asset.id;
          const fits = fitsSurface(asset, surface);
          return (
            <button
              key={asset.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!asset.active}
              onClick={() => onSelect(asset)}
              className={cn(
                "group overflow-hidden rounded-xl border bg-background text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
                selected
                  ? "border-[var(--nav-primary)] ring-2 ring-[var(--nav-primary)]/25"
                  : "border-border hover:border-[var(--nav-primary)]/40",
              )}
            >
              <span className={cn("relative block w-full bg-muted", surface.aspectClass)}>
                <img
                  src={asset.image_url}
                  alt={asset.alt_text}
                  width={surface.width}
                  height={surface.height}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                {selected ? (
                  <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-[var(--nav-primary)] text-white">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  </span>
                ) : null}
              </span>
              <span className="block space-y-1.5 p-2.5">
                <span className="block truncate text-xs font-medium text-text-primary">
                  {asset.title}
                </span>
                <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-text-secondary">
                  {asset.width && asset.height ? (
                    <span>
                      {asset.width}×{asset.height}
                    </span>
                  ) : null}
                  {!asset.active ? <Badge variant="outline">Archived</Badge> : null}
                  {fits ? null : (
                    <span className="inline-flex items-center gap-1 text-amber-700">
                      <AlertTriangle className="h-3 w-3" aria-hidden />
                      Crops to fit
                    </span>
                  )}
                  {asset.usage_type === "campaign" ? (
                    <span className="text-text-secondary/80">
                      {surfaceFor(asset.usage_type).label}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
