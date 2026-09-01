"use client";

import type {
  FeeCashbackPayoutRequest,
  FeeCashbackRead,
} from "@/lib/admin-fee-cashbacks-api";
import type { ApiResponse } from "@/lib/api/client";
import { buildFeeCashbackPayoutPayload } from "@/lib/fee-cashback-payout-form";
import { formatPaise } from "@/lib/format";
import { MoneyPayoutDialog } from "./money-payout-dialog";

export function FeeCashbackPayoutDialog({
  cashback,
  onOpenChange,
  onPay,
}: {
  cashback: FeeCashbackRead | null;
  onOpenChange: (open: boolean) => void;
  onPay: (cashbackId: string, body: FeeCashbackPayoutRequest) => Promise<ApiResponse<unknown>>;
}) {
  return (
    <MoneyPayoutDialog
      open={cashback !== null}
      onOpenChange={onOpenChange}
      title={cashback ? formatPaise(cashback.amount_paise) : "Cashback payout"}
      description={cashback?.client_name ?? "Unknown client"}
      idPrefix="cashback-payout"
      lockedCopy="Recipient and amount come from this cashback and cannot be changed here. Enter only where the money should go."
      submitLabel="Pay cashback"
      conflictTitle="This cashback may already have a payout"
      onSubmit={(form) => onPay(cashback!.id, buildFeeCashbackPayoutPayload(form))}
    />
  );
}
