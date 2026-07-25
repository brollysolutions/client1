"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { introduceAgentLead } from "@/lib/agent-api";

const MOBILE_PATTERN = /^\+[1-9]\d{6,14}$/;

export function AgentIntroduceLeadForm() {
  const router = useRouter();
  const [mobile, setMobile] = React.useState("");
  const [name, setName] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!MOBILE_PATTERN.test(mobile.trim())) {
      toast.error("Enter a valid mobile number", {
        description: "Include the country code, e.g. +919876543210.",
      });
      return;
    }
    setSaving(true);
    const res = await introduceAgentLead({
      mobile: mobile.trim(),
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
    <div className="mx-auto w-full max-w-lg space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Introduce a lead</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Add someone you have referred. A telecaller will follow up.
        </p>
      </div>

      <form
        className="space-y-4 rounded-2xl border border-border bg-card p-5"
        onSubmit={(e) => void onSubmit(e)}
      >
        <div>
          <Label htmlFor="mobile">Mobile number</Label>
          <Input
            id="mobile"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="+919876543210"
          />
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
        <div>
          <Label htmlFor="notes">What are they looking for? (optional)</Label>
          <Textarea
            id="notes"
            rows={3}
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Home loan for a 40 lakh apartment"
          />
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Introduce lead
        </Button>
      </form>
    </div>
  );
}
