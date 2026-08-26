// Shared date-range predicate for client-side list filtering (admin tables,
// telecaller lead lists, etc.) — a value is in range if its date falls on or
// after `from` and on or before `to` (both plain "YYYY-MM-DD" strings; an
// empty bound is unbounded on that side).
export function isInDateRange(value: string | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  const date = value.slice(0, 10);
  return (!from || date >= from) && (!to || date <= to);
}
