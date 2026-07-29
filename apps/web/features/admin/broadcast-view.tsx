"use client";

import * as React from "react";
import { Loader2, Megaphone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  previewBroadcast,
  sendBroadcast,
  type BroadcastAudience,
} from "@/lib/admin-broadcast-api";

const AUDIENCE_LABEL: Record<BroadcastAudience, string> = {
  admins: "Admins",
  staff: "All staff",
  agents: "Agents",
  clients: "Clients",
  all: "Everyone (staff + agents + clients)",
};

const LINE_SCOPED_AUDIENCES = new Set<BroadcastAudience>(["staff", "agents", "clients", "all"]);

// Admin broadcast composer (feature-status.md §3-12). A broadcast is
// unretractable — no delete endpoint exists, and none should be added — so
// this view forces a preview count before the send button is even enabled,
// and the confirm step names that count explicitly.
export function BroadcastView() {
  const [audience, setAudience] = React.useState<BroadcastAudience>("clients");
  const [businessLine, setBusinessLine] = React.useState<"" | "loans" | "real_estate">("");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [href, setHref] = React.useState("");

  const [previewCount, setPreviewCount] = React.useState<number | null>(null);
  const [previewing, setPreviewing] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Any field change invalidates a prior preview — the count must always
  // reflect the audience/line the admin is about to actually send to.
  React.useEffect(() => {
    setPreviewCount(null);
  }, [audience, businessLine]);

  async function handlePreview() {
    setPreviewing(true);
    setError(null);
    const res = await previewBroadcast(audience, businessLine || undefined);
    setPreviewing(false);
    if (!res.ok) {
      setError(res.error || "Could not resolve the audience.");
      return;
    }
    setPreviewCount(res.data);
  }

  async function handleSend() {
    if (previewCount === null) return;
    if (!title.trim() || !body.trim()) {
      setError("Title and message are required.");
      return;
    }
    const confirmed = window.confirm(
      `Send this notification to ${previewCount} ${previewCount === 1 ? "person" : "people"}? This cannot be undone.`,
    );
    if (!confirmed) return;

    setSending(true);
    setError(null);
    const res = await sendBroadcast({
      audience,
      business_line: businessLine || null,
      title: title.trim(),
      body: body.trim(),
      href: href.trim() || null,
    });
    setSending(false);
    if (!res.ok) {
      setError(res.error || "Broadcast failed to send.");
      return;
    }
    toast.success(`Sent to ${res.data} ${res.data === 1 ? "person" : "people"}.`);
    setTitle("");
    setBody("");
    setHref("");
    setPreviewCount(null);
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-text-primary">
          <Megaphone className="h-6 w-6 text-loans-accent" aria-hidden="true" />
          Broadcast
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Send a notification to every matching user. This cannot be undone — always preview the
          audience first.
        </p>
      </div>

      <div className="space-y-5 rounded-2xl border border-border bg-card p-6">
        <div className="grid gap-2">
          <Label htmlFor="broadcast-audience">Audience</Label>
          <Select value={audience} onValueChange={(v) => setAudience(v as BroadcastAudience)}>
            <SelectTrigger id="broadcast-audience">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(AUDIENCE_LABEL) as BroadcastAudience[]).map((value) => (
                <SelectItem key={value} value={value}>
                  {AUDIENCE_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {LINE_SCOPED_AUDIENCES.has(audience) && (
          <div className="grid gap-2">
            <Label htmlFor="broadcast-line">Business line</Label>
            <Select
              value={businessLine || "any"}
              onValueChange={(v) => setBusinessLine(v === "any" ? "" : (v as "loans" | "real_estate"))}
            >
              <SelectTrigger id="broadcast-line">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Both lines</SelectItem>
                <SelectItem value="loans">Loans</SelectItem>
                <SelectItem value="real_estate">Real Estate</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="broadcast-title">Title</Label>
          <Input
            id="broadcast-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="e.g. Scheduled maintenance tonight"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="broadcast-body">Message</Label>
          <Textarea
            id="broadcast-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="What do they need to know?"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="broadcast-href">Link (optional)</Label>
          <Input
            id="broadcast-href"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            maxLength={300}
            placeholder="/dashboard/..."
          />
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handlePreview}
            disabled={previewing || sending}
          >
            {previewing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Preview audience
          </Button>

          {previewCount !== null && (
            <span className="text-sm text-text-secondary">
              Reaches <span className="font-semibold text-text-primary">{previewCount}</span>{" "}
              {previewCount === 1 ? "person" : "people"}
            </span>
          )}

          <Button
            type="button"
            onClick={handleSend}
            disabled={previewCount === null || sending || !title.trim() || !body.trim()}
            className="ml-auto"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Send broadcast
          </Button>
        </div>
      </div>
    </div>
  );
}
