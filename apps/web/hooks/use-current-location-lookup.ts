"use client";

import * as React from "react";

import {
  lookupReadableLocation,
  REVERSE_GEOCODE_ENDPOINT,
  type ReadableLocation,
} from "@/lib/reverse-geocode";

const REVERSE_GEOCODE_TIMEOUT_MS = 8_000;

function browserPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10_000,
      maximumAge: 5 * 60 * 1000,
    });
  });
}

function geolocationErrorMessage(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error && typeof error.code === "number"
      ? error.code
      : null;
  if (code !== null) {
    if (code === 1) {
      return "Location permission was not granted. Try again or enter a location manually.";
    }
    if (code === 3) {
      return "Finding your location took too long. Try again or enter a location manually.";
    }
    return "Your current location is unavailable. Try again or enter a location manually.";
  }
  return "We couldn't find a city or locality for your current location. Try again or enter it manually.";
}

export function currentLocationErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.startsWith("Current location:")
    ? error.message.slice("Current location: ".length)
    : geolocationErrorMessage(error);
}

export function useCurrentLocationLookup({
  onPendingChange,
}: {
  onPendingChange?: (pending: boolean) => void;
} = {}) {
  const [locating, setLocating] = React.useState(false);
  const mounted = React.useRef(true);
  const activeController = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeController.current?.abort();
    };
  }, []);

  const setPending = React.useCallback(
    (pending: boolean) => {
      if (mounted.current) {
        setLocating(pending);
        onPendingChange?.(pending);
      }
    },
    [onPendingChange],
  );

  const findCurrentLocation = React.useCallback(async (): Promise<ReadableLocation> => {
    if (!REVERSE_GEOCODE_ENDPOINT || !navigator.geolocation) {
      throw new Error("Current location: Current location is not available in this browser.");
    }

    setPending(true);
    try {
      let position: GeolocationPosition;
      try {
        position = await browserPosition();
      } catch (error) {
        throw new Error(`Current location: ${geolocationErrorMessage(error)}`);
      }

      if (!mounted.current) {
        throw new Error("Current location: Current location lookup was cancelled.");
      }

      const controller = new AbortController();
      activeController.current = controller;
      const timeout = window.setTimeout(() => controller.abort(), REVERSE_GEOCODE_TIMEOUT_MS);
      try {
        return await lookupReadableLocation(position.coords.latitude, position.coords.longitude, {
          endpoint: REVERSE_GEOCODE_ENDPOINT,
          language: navigator.language.split("-")[0],
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeout);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Current location:")) {
        throw error;
      }
      throw new Error(
        "Current location: We couldn't find a city or locality for your current location. Try again or enter it manually.",
      );
    } finally {
      activeController.current = null;
      setPending(false);
    }
  }, [setPending]);

  return {
    available: Boolean(REVERSE_GEOCODE_ENDPOINT),
    locating,
    findCurrentLocation,
  };
}
