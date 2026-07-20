import { Headset } from "lucide-react";

import { ComingSoon } from "@/features/dashboard/coming-soon";

export default function SupportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Support</h1>
        <p className="text-sm text-text-secondary">
          Need a hand? Raise a ticket and our team will help.
        </p>
      </div>
      <ComingSoon
        icon={Headset}
        title="Support tickets are coming soon"
        description="Soon you'll be able to raise a ticket here for login trouble, OTP issues, or any general question, and track our reply."
        accentClassName="bg-loans-soft text-loans-accent"
      />
    </div>
  );
}
