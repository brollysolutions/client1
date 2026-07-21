"use client";

import { Mail, Phone, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";

// Mock assigned real-estate agent. No agent-assignment backend exists yet, so
// this is a static placeholder card; the message action is a stub toast until
// messaging lands.
const MOCK_AGENT = {
  name: "Priya Nair",
  rera: "RERA/AGT/2024/00123",
  phone: "+91 98765 43210",
  email: "priya.nair@example.com",
};

export function AgentView() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">My Agent</h1>
        <p className="text-sm text-text-secondary">Your assigned real-estate agent.</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-4">
          <UserAvatar name={MOCK_AGENT.name} size="lg" />
          <div className="min-w-0">
            <p className="font-semibold text-text-primary">{MOCK_AGENT.name}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-text-secondary">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {MOCK_AGENT.rera}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-2 border-t border-border pt-5">
          <p className="flex items-center gap-2 text-sm text-text-primary">
            <Phone className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
            {MOCK_AGENT.phone}
          </p>
          <p className="flex items-center gap-2 text-sm text-text-primary">
            <Mail className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
            {MOCK_AGENT.email}
          </p>
        </div>

        <Button
          className="mt-5 w-full sm:w-auto"
          onClick={() =>
            toast.info("Messaging is coming soon", {
              description: "For now, reach your agent by phone or email.",
            })
          }
        >
          Message agent
        </Button>
      </div>
    </div>
  );
}
