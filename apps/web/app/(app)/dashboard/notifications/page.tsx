import { Bell } from "lucide-react";

import { ComingSoon } from "@/features/dashboard/coming-soon";

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Notifications</h1>
        <p className="text-sm text-text-secondary">
          Updates on your applications, payouts, and account.
        </p>
      </div>
      <ComingSoon
        icon={Bell}
        title="Notifications are coming soon"
        description="Soon you'll get alerts here when your loan status changes, a payout lands, or your account needs attention, each one linking straight to the detail."
        accentClassName="bg-loans-soft text-loans-accent"
      />
    </div>
  );
}
