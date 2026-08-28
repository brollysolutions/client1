export type MoneyPayoutRequestState = "payable" | "awaiting_approval" | "settled";

/**
 * A money row remains in its payable status while the maker-checker payout is
 * pending. The linked payout id is therefore the load-bearing second half of
 * the state: once present, the action must stay disabled until approval moves
 * the ledger row to its terminal status.
 */
export function getMoneyPayoutRequestState({
  status,
  payableStatus,
  payoutId,
}: {
  status: string;
  payableStatus: string;
  payoutId: string | null | undefined;
}): MoneyPayoutRequestState {
  if (status !== payableStatus) return "settled";
  return payoutId == null ? "payable" : "awaiting_approval";
}
