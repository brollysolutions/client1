import type { Banner } from "@/lib/banners-api";
import type { Offer } from "@/lib/offers-api";
import type { ReferralBonusConfig, ReferralPayoutActivity } from "@/lib/referral-bonus-api";

function inRange(value: string | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  const day = value.slice(0, 10);
  return (!from || day >= from) && (!to || day <= to);
}

function includes(value: string, search: string): boolean {
  return value.toLowerCase().includes(search.trim().toLowerCase());
}

export type QueueFilters = { search: string; status: string; line: string; kind: string; from: string; to: string };

export function filterBanners(items: Banner[], filters: QueueFilters): Banner[] {
  return items.filter((item) => includes(`${item.title} ${item.subtitle ?? ""}`, filters.search) && (filters.status === "all" || item.status === filters.status) && (filters.line === "all" || item.business_line === filters.line) && (filters.kind === "all" || item.banner_type === filters.kind) && inRange(item.updated_at, filters.from, filters.to));
}

export function filterOffers(items: Offer[], filters: QueueFilters): Offer[] {
  return items.filter((item) => includes(`${item.title} ${item.description ?? ""} ${item.code ?? ""}`, filters.search) && (filters.status === "all" || item.status === filters.status) && (filters.line === "all" || item.business_line === filters.line) && (filters.kind === "all" || item.discount_type === filters.kind) && inRange(item.starts_at ?? item.created_at, filters.from, filters.to));
}

export function filterReferralRules(items: ReferralBonusConfig[], filters: QueueFilters): ReferralBonusConfig[] {
  return items.filter((item) => includes(`${item.bonus_amount} ${JSON.stringify(item.rule)}`, filters.search) && (filters.status === "all" || (filters.status === "active") === item.active) && (filters.line === "all" || item.business_line === filters.line) && inRange(item.updated_at, filters.from, filters.to));
}

export function filterReferralActivity(items: ReferralPayoutActivity[], filters: Pick<QueueFilters, "search" | "status" | "line" | "from" | "to">): ReferralPayoutActivity[] {
  return items.filter((item) => includes(`${item.description} ${item.currency} ${item.amount_paise}`, filters.search) && (filters.status === "all" || item.status === filters.status) && (filters.line === "all" || item.business_line === filters.line) && inRange(item.created_at, filters.from, filters.to));
}
