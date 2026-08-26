"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { MobileInput } from "@/components/auth/mobile-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DashboardFormPage, DashboardFormSection } from "@/features/dashboard/dashboard-ui";
import { introduceAgentLead } from "@/lib/agent-api";
import { isValidMobile, toE164 } from "@/lib/phone";

export function AgentIntroduceLeadForm() {
  const router = useRouter();
  // Bare 10-digit digits, matching the shared MobileInput/phone.ts contract
  // used across the rest of the app; converted to E.164 at submit time.
  const [mobile, setMobile] = React.useState("");
  const [name, setName] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidMobile(mobile)) {
      toast.error("Enter a valid mobile number", {
        description: "Enter a 10-digit Indian mobile number.",
      });
      return;
    }
    setSaving(true);
    const res = await introduceAgentLead({
      mobile: toE164(mobile),
      name: name.trim() || null,
      requirement: notes.trim() ? { notes: notes.trim() } : null,
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Lead introduced");
      router.push(`/dashboard/leads/${res.data.id}`);
    } else {
      toast.error("Couldn't introduce this lead", { description: res.error });
    }
  }

  return (
    <DashboardFormPage
      eyebrow="Agent workspace"
      title="Introduce a lead"
      description="Add someone you have referred. A telecaller will follow up."
      backHref="/dashboard/leads"
      backLabel="Back to leads"
      formTitle="Lead details"
    >
      <form className="space-y-6" onSubmit={(e) => void onSubmit(e)}>
        <DashboardFormSection title="Contact">
          <div>
            <Label htmlFor="mobile">Mobile number</Label>
            <MobileInput id="mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="98765 43210" />
          </div>
          <div>
            <Label htmlFor="name">Name (optional)</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
            />
          </div>
        </DashboardFormSection>

        <DashboardFormSection title="Requirement" description="Optional — help the telecaller follow up faster.">
          <div>
            <Label htmlFor="notes">What are they looking for?</Label>
            <Textarea
              id="notes"
              rows={3}
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Home loan for a 40 lakh apartment"
            />
          </div>
        </DashboardFormSection>

        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Introduce lead
        </Button>
      </form>
    </DashboardFormPage>
  );
}
