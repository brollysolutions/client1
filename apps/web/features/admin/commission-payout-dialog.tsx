"use client";

import type { CommissionPayoutRequest, CommissionRead } from "@/lib/admin-commissions-api";
import type { ApiResponse } from "@/lib/api/client";
import { buildCommissionPayoutPayload } from "@/lib/commission-payout-form";
import { formatPaise } from "@/lib/format";
import { MoneyPayoutDialog } from "./money-payout-dialog";

export function CommissionPayoutDialog({
  commission,
  onOpenChange,
  onPay,
}: {
  commission: CommissionRead | null;
  onOpenChange: (open: boolean) => void;
  onPay: (commissionId: string, body: CommissionPayoutRequest) => Promise<ApiResponse<unknown>>;
}) {
  return (
    <MoneyPayoutDialog
      open={commission !== null}
      onOpenChange={onOpenChange}
      title={commission ? formatPaise(commission.agreed_amount_paise) : "Commission payout"}
      description={
        commission ? `${commission.agent_name ?? "Unknown agent"} · ${commission.agent_code}` : ""
      }
      idPrefix="commission-payout"
      lockedCopy="Recipient and amount come from this commission and cannot be changed here. Enter only where the money should go."
      submitLabel="Pay commission"
      conflictTitle="This commission may already have a payout"
      onSubmit={(form) => onPay(commission!.id, buildCommissionPayoutPayload(form))}
    />
  );
}
