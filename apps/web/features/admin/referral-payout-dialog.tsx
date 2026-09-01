"use client";

import type { AdminReferral, ReferralPayoutRequest } from "@/lib/admin-referrals-api";
import type { ApiResponse } from "@/lib/api/client";
import { formatPaise } from "@/lib/format";
import { buildReferralPayoutPayload } from "@/lib/referral-payout-form";
import { MoneyPayoutDialog } from "./money-payout-dialog";

export function ReferralPayoutDialog({
  referral,
  onOpenChange,
  onPay,
}: {
  referral: AdminReferral | null;
  onOpenChange: (open: boolean) => void;
  onPay: (referralId: string, body: ReferralPayoutRequest) => Promise<ApiResponse<unknown>>;
}) {
  const amountPaise = referral?.bonus_amount_paise ?? null;
  return (
    <MoneyPayoutDialog
      open={referral !== null && amountPaise !== null}
      onOpenChange={onOpenChange}
      title={amountPaise === null ? "Referral payout" : formatPaise(amountPaise)}
      description={
        referral
          ? `${referral.referrer_name ?? "Unknown referrer"}${referral.referrer_code ? ` · ${referral.referrer_code}` : ""}`
          : ""
      }
      idPrefix="referral-payout"
      lockedCopy="Recipient and amount come from this referral and cannot be changed here. Enter only where the money should go."
      submitLabel="Pay bonus"
      conflictTitle="This referral may already have a payout"
      onSubmit={(form) => onPay(referral!.id, buildReferralPayoutPayload(form))}
    />
  );
}
