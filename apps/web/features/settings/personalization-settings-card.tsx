"use client";

import * as React from "react";
import { Crosshair, Loader2, MapPinOff, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  capturePersonalizationLocation,
  getPersonalizationPreference,
  revokePersonalizationLocation,
  setPersonalizationPreference,
  type PersonalizationPreference,
} from "@/lib/personalization-api";

export function PersonalizationSettingsCard() {
  const [preference, setPreference] = React.useState<PersonalizationPreference | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    void getPersonalizationPreference().then((result) => {
      if (!active) return;
      if (result.ok) setPreference(result.data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function setEnabled(enabled: boolean) {
    setBusy(true);
    const result = await setPersonalizationPreference(enabled);
    setBusy(false);
    if (result.ok) {
      setPreference(result.data);
      toast.success(enabled ? "Personalized content enabled." : "Personalized content disabled.");
    } else {
      toast.error(result.error);
    }
  }

  async function enableLocation() {
    if (!navigator.geolocation) {
      toast.error("Location is not available in this browser.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void (async () => {
          const result = await capturePersonalizationLocation(
            position.coords.latitude,
            position.coords.longitude,
          );
          setBusy(false);
          if (result.ok) {
            setPreference(result.data);
            toast.success("Location-based suggestions enabled.");
          } else {
            toast.error(result.error);
          }
        })();
      },
      () => {
        setBusy(false);
        toast.error("Location permission was not granted.");
      },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }

  async function disableLocation() {
    setBusy(true);
    const result = await revokePersonalizationLocation();
    setBusy(false);
    if (result.ok) {
      setPreference(result.data);
      toast.success("Saved location removed.");
    } else {
      toast.error(result.error);
    }
  }

  if (loading) return <Skeleton className="h-56 rounded-xl" />;
  if (!preference) return null;

  return (
    <section className="space-y-5 rounded-xl border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 text-blue-700" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Personalized dashboard</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Use your account type and current application activity to choose useful dashboard
            highlights. This does not use browsing or click history.
          </p>
        </div>
      </div>

      <Label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4 font-normal">
        <Checkbox
          checked={preference.personalization_enabled}
          disabled={busy}
          onCheckedChange={(checked) => void setEnabled(checked === true)}
          aria-label="Enable personalized dashboard content"
        />
        <span>
          <span className="block text-sm font-medium text-text-primary">Personalized content</span>
          <span className="mt-1 block text-xs text-text-secondary">
            Turning this off also removes the saved coarse location.
          </span>
        </span>
      </Label>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/30 p-4">
        <div>
          <p className="text-sm font-medium text-text-primary">Location-based suggestions</p>
          <p className="mt-1 text-xs text-text-secondary">
            Optional. We save only a rounded location for up to 30 days, never an exact trail.
          </p>
          {preference.location_captured_at ? (
            <p className="mt-1 text-xs text-text-secondary">
              Last refreshed {new Date(preference.location_captured_at).toLocaleDateString()}.
            </p>
          ) : null}
        </div>
        {preference.location_enabled ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void enableLocation()}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Crosshair className="h-4 w-4" />
              )}
              Refresh location
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void disableLocation()}
            >
              <MapPinOff className="h-4 w-4" />
              Remove location
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={busy || !preference.personalization_enabled}
            onClick={() => void enableLocation()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
            Use my location
          </Button>
        )}
      </div>
    </section>
  );
}
