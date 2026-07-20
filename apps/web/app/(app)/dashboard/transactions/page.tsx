import { Wallet } from "lucide-react";

import { ComingSoon } from "@/features/dashboard/coming-soon";

export default function TransactionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Transactions</h1>
        <p className="text-sm text-text-secondary">
          Your cashback and referral payouts, all in one ledger.
        </p>
      </div>
      <ComingSoon
        icon={Wallet}
        title="Your payout ledger is coming soon"
        description="Soon you'll see every cashback and referral payout here, with dates and status, so you always know what has been paid."
        accentClassName="bg-loans-soft text-loans-accent"
      />
    </div>
  );
}
