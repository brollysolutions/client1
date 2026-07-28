// Pure helpers for the per-bank loan-type availability matrix. Absence of an
// entry means available -- the one place on the frontend where getting the
// default direction backwards would silently misrepresent what the backend
// actually enforces (services/loan_applications.py mirrors this exact rule).

import type { AvailabilityEntry } from "@/lib/loan-config-api";

export function isAvailable(
  entries: AvailabilityEntry[],
  bankId: string,
  loanTypeId: string,
): boolean {
  const entry = entries.find((e) => e.bank_id === bankId && e.loan_type_id === loanTypeId);
  return entry === undefined || entry.available;
}
