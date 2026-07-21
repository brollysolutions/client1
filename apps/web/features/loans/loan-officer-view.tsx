"use client";

import { Mail, Phone, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";

// Mock assigned loan officer. No staff-assignment backend exists yet, so this
// is a static placeholder card; the message action is a stub toast until
// messaging lands.
const MOCK_OFFICER = {
  name: "Arjun Mehta",
  employeeCode: "EMP-LN-00456",
  phone: "+91 98765 12340",
  email: "arjun.mehta@example.com",
};

export function LoanOfficerView() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">My Loan Officer</h1>
        <p className="text-sm text-text-secondary">Your assigned loan officer.</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-4">
          <UserAvatar name={MOCK_OFFICER.name} size="lg" />
          <div className="min-w-0">
            <p className="font-semibold text-text-primary">{MOCK_OFFICER.name}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-text-secondary">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {MOCK_OFFICER.employeeCode}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-2 border-t border-border pt-5">
          <p className="flex items-center gap-2 text-sm text-text-primary">
            <Phone className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
            {MOCK_OFFICER.phone}
          </p>
          <p className="flex items-center gap-2 text-sm text-text-primary">
            <Mail className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
            {MOCK_OFFICER.email}
          </p>
        </div>

        <Button
          className="mt-5 w-full sm:w-auto"
          onClick={() =>
            toast.info("Messaging is coming soon", {
              description: "For now, reach your loan officer by phone or email.",
            })
          }
        >
          Message loan officer
        </Button>
      </div>
    </div>
  );
}
