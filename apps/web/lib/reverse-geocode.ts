const LOCATION_MAX_LENGTH = 500;

export type ReadableLocation = {
  label: string;
  locality: string | null;
  city: string | null;
  subdivision: string | null;
  country: string | null;
};

export function normalizeReverseGeocodeEndpoint(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export const REVERSE_GEOCODE_ENDPOINT = normalizeReverseGeocodeEndpoint(
  process.env.NEXT_PUBLIC_REVERSE_GEOCODE_URL,
);
export const REVERSE_GEOCODE_PROVIDER_LABEL = REVERSE_GEOCODE_ENDPOINT
  ? new URL(REVERSE_GEOCODE_ENDPOINT).hostname
  : "the configured location provider";

function normalizedLocationPart(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized.slice(0, 160) : null;
}

export function parseReverseGeocodedLocation(response: unknown): ReadableLocation | null {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return null;
  }

  const data = response as Record<string, unknown>;
  const locality = normalizedLocationPart(data.locality);
  const city = normalizedLocationPart(data.city);
  const subdivision = normalizedLocationPart(data.principalSubdivision);
  const country = normalizedLocationPart(data.countryName);
  const candidates = locality || city ? [locality, city, subdivision] : [subdivision, country];
  const seen = new Set<string>();
  const parts = candidates.filter((part): part is string => {
    if (!part) {
      return false;
    }
    const key = part.toLocaleLowerCase("en");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  if (!locality && !city && (!subdivision || !country)) {
    return null;
  }
  return {
    label: parts.join(", ").slice(0, LOCATION_MAX_LENGTH),
    locality,
    city,
    subdivision,
    country,
  };
}

export function formatReverseGeocodedLocation(response: unknown): string | null {
  return parseReverseGeocodedLocation(response)?.label ?? null;
}

export async function lookupReadableLocation(
  latitude: number,
  longitude: number,
  {
    endpoint,
    fetcher = fetch,
    language,
    signal,
  }: {
    endpoint: string;
    fetcher?: typeof fetch;
    language?: string;
    signal?: AbortSignal;
  },
): Promise<ReadableLocation> {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error("Readable location lookup received invalid coordinates");
  }

  const safeEndpoint = normalizeReverseGeocodeEndpoint(endpoint);
  if (!safeEndpoint) {
    throw new Error("Readable location lookup is not configured safely");
  }

  const url = new URL(safeEndpoint);
  url.searchParams.set("latitude", String(Number(latitude.toFixed(2))));
  url.searchParams.set("longitude", String(Number(longitude.toFixed(2))));
  if (language && /^[a-z]{2,3}$/i.test(language)) {
    url.searchParams.set("localityLanguage", language.toLowerCase());
  }
  const response = await fetcher(url, {
    method: "GET",
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal,
  });
  if (!response.ok) {
    throw new Error("Readable location lookup failed");
  }

  const location = parseReverseGeocodedLocation(await response.json());
  if (!location) {
    throw new Error("Readable location was not found");
  }
  return location;
}
