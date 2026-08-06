const DAY_MS = 24 * 60 * 60 * 1000;

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown expiry date";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export function formatAgentLeadExpiry(
  status: string,
  expiresAt: string | null,
  expiredAt: string | null,
  nowMs: number = Date.now(),
): string {
  if (status === "expired" || expiredAt) {
    return expiredAt
      ? `Expired ${formatDate(expiredAt)} — returned to pool`
      : "Expired — returned to pool";
  }
  if (status === "converted" || status === "closed") {
    return "No longer subject to expiry";
  }
  if (!expiresAt) return "No expiry deadline";

  const deadlineMs = new Date(expiresAt).getTime();
  if (Number.isNaN(deadlineMs)) return "Unknown expiry date";
  const remainingMs = deadlineMs - nowMs;
  if (remainingMs <= 0) return "Expiry due — awaiting pool release";

  const days = Math.ceil(remainingMs / DAY_MS);
  return `Expires in ${days} ${days === 1 ? "day" : "days"}`;
}

export function isAgentLeadExpiryDue(
  status: string,
  expiresAt: string | null,
  expiredAt: string | null,
  nowMs: number = Date.now(),
): boolean {
  if (status === "expired" || expiredAt || status === "converted" || status === "closed") {
    return false;
  }
  if (!expiresAt) return false;
  const deadlineMs = new Date(expiresAt).getTime();
  return !Number.isNaN(deadlineMs) && deadlineMs <= nowMs;
}
