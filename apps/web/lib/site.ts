import { SITE_NAME, TRUST_LINE } from "@/lib/brand";

type SiteEnvironment = Record<string, string | undefined>;

type SiteContact = {
  phone: string;
  phoneHref: string;
  email: string;
  emailHref: string;
  hours: string[];
  address: string[];
};

type SiteConfig = {
  siteUrl: string;
  contact: SiteContact;
};

const LOCAL_DEFAULTS = {
  siteUrl: "https://www.example.com",
  phone: "+91 98765 43210",
  email: "hello@example.com",
  hours: "Monday to Saturday|10:00 AM to 7:00 PM",
  address: "1st Floor, Sample Towers|Banjara Hills, Hyderabad 500034",
} as const;

const CONFIG_KEYS = {
  siteUrl: "NEXT_PUBLIC_SITE_URL",
  phone: "NEXT_PUBLIC_CONTACT_PHONE",
  email: "NEXT_PUBLIC_CONTACT_EMAIL",
  hours: "NEXT_PUBLIC_CONTACT_HOURS",
  address: "NEXT_PUBLIC_CONTACT_ADDRESS",
} as const;

function publicValue(
  env: SiteEnvironment,
  key: string,
  fallback: string,
  strict: boolean,
): string {
  const value = env[key]?.trim();
  if (value) return value;
  if (strict) {
    throw new Error(`${key} is required for a production Dhanadhara build.`);
  }
  return fallback;
}

function publicLines(value: string, key: string): string[] {
  const lines = value
    .split("|")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    throw new Error(`${key} must contain at least one published line.`);
  }
  return lines;
}

function isPlaceholderHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  const placeholderLabels = new Set(["example", "invalid", "localhost", "sample", "test"]);
  return (
    placeholderLabels.has(normalized) ||
    normalized.split(".").some((label) => placeholderLabels.has(label))
  );
}

function containsPlaceholderText(value: string): boolean {
  return /\b(change[ _-]?me|example|placeholder|sample|todo)\b/i.test(value);
}

export function resolveSiteConfig(env: SiteEnvironment): SiteConfig {
  const strict = env.DHANADHARA_REQUIRE_PUBLIC_CONFIG === "true";
  const rawSiteUrl = publicValue(
    env,
    CONFIG_KEYS.siteUrl,
    LOCAL_DEFAULTS.siteUrl,
    strict,
  );

  let parsedSiteUrl: URL;
  try {
    parsedSiteUrl = new URL(rawSiteUrl);
  } catch {
    throw new Error(`${CONFIG_KEYS.siteUrl} must be a valid absolute URL.`);
  }
  if (!["http:", "https:"].includes(parsedSiteUrl.protocol)) {
    throw new Error(`${CONFIG_KEYS.siteUrl} must use HTTP or HTTPS.`);
  }
  if (strict && parsedSiteUrl.protocol !== "https:") {
    throw new Error(`${CONFIG_KEYS.siteUrl} must use HTTPS in production.`);
  }
  if (strict && isPlaceholderHost(parsedSiteUrl.hostname)) {
    throw new Error(`${CONFIG_KEYS.siteUrl} cannot use a placeholder host in production.`);
  }
  if (
    strict &&
    (parsedSiteUrl.username ||
      parsedSiteUrl.password ||
      parsedSiteUrl.pathname !== "/" ||
      parsedSiteUrl.search ||
      parsedSiteUrl.hash)
  ) {
    throw new Error(`${CONFIG_KEYS.siteUrl} must be an origin without credentials, path, query, or fragment.`);
  }

  const phone = publicValue(
    env,
    CONFIG_KEYS.phone,
    LOCAL_DEFAULTS.phone,
    strict,
  );
  const normalizedPhone = phone.replace(/[^+\d]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
    throw new Error(`${CONFIG_KEYS.phone} must be a dialable international number.`);
  }
  if (strict && phone === LOCAL_DEFAULTS.phone) {
    throw new Error(`${CONFIG_KEYS.phone} cannot use the sample number in production.`);
  }

  const email = publicValue(
    env,
    CONFIG_KEYS.email,
    LOCAL_DEFAULTS.email,
    strict,
  ).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`${CONFIG_KEYS.email} must be a valid public email address.`);
  }
  const emailHost = email.slice(email.lastIndexOf("@") + 1);
  if (strict && isPlaceholderHost(emailHost)) {
    throw new Error(`${CONFIG_KEYS.email} cannot use a placeholder host in production.`);
  }

  const rawHours = publicValue(env, CONFIG_KEYS.hours, LOCAL_DEFAULTS.hours, strict);
  const rawAddress = publicValue(env, CONFIG_KEYS.address, LOCAL_DEFAULTS.address, strict);
  if (strict && containsPlaceholderText(rawAddress)) {
    throw new Error(`${CONFIG_KEYS.address} cannot contain placeholder text in production.`);
  }
  const hours = publicLines(rawHours, CONFIG_KEYS.hours);
  const address = publicLines(rawAddress, CONFIG_KEYS.address);

  return {
    siteUrl: parsedSiteUrl.toString().replace(/\/$/, ""),
    contact: {
      phone,
      phoneHref: `tel:${normalizedPhone}`,
      email,
      emailHref: `mailto:${email}`,
      hours,
      address,
    },
  };
}

const siteConfig = resolveSiteConfig({
  DHANADHARA_REQUIRE_PUBLIC_CONFIG:
    process.env.DHANADHARA_REQUIRE_PUBLIC_CONFIG,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_CONTACT_PHONE: process.env.NEXT_PUBLIC_CONTACT_PHONE,
  NEXT_PUBLIC_CONTACT_EMAIL: process.env.NEXT_PUBLIC_CONTACT_EMAIL,
  NEXT_PUBLIC_CONTACT_HOURS: process.env.NEXT_PUBLIC_CONTACT_HOURS,
  NEXT_PUBLIC_CONTACT_ADDRESS: process.env.NEXT_PUBLIC_CONTACT_ADDRESS,
});

export const SITE_URL = siteConfig.siteUrl;
export const SITE_CONTACT = siteConfig.contact;
export { SITE_NAME, TRUST_LINE };
