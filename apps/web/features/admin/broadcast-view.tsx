"use client";

import * as React from "react";
import { Loader2, Send, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { FieldError, RequiredIndicator } from "@/components/ui/field-error";
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
  DashboardHeader,
  DashboardPage,
  DashboardPanel,
} from "@/features/dashboard/dashboard-ui";
import {
  previewBroadcast,
  sendBroadcast,
  type BroadcastAudience,
} from "@/lib/admin-broadcast-api";
import {
  apiIssuesToFieldErrors,
  focusFirstInvalidField,
  requiredTextError,
} from "@/lib/form-validation";
import { isSafeLocalHref } from "@/lib/safe-local-href";

const AUDIENCE_LABEL: Record<BroadcastAudience, string> = {
  admins: "Admins",
  staff: "All staff",
  agents: "Agents",
  clients: "Clients",
  all: "Everyone (staff + agents + clients)",
};

const LINE_SCOPED_AUDIENCES = new Set<BroadcastAudience>(["staff", "agents", "clients", "all"]);

// A broadcast is unretractable: the preview gate and exact-count confirmation
// are deliberately load-bearing and must remain in front of every send.
export function BroadcastView() {
  const [audience, setAudience] = React.useState<BroadcastAudience>("clients");
  const [businessLine, setBusinessLine] = React.useState<"" | "loans" | "real_estate">("");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [href, setHref] = React.useState("");
  const [previewCount, setPreviewCount] = React.useState<number | null>(null);
  const [previewing, setPreviewing] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const { confirm, confirmDialog } = useConfirm();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const composerRef = React.useRef<HTMLDivElement>(null);

  function clearFieldError(field: string) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function showFieldErrors(next: Record<string, string>) {
    setFieldErrors(next);
    if (Object.keys(next).length > 0) {
      requestAnimationFrame(() => {
        if (composerRef.current) focusFirstInvalidField(composerRef.current);
      });
    }
  }

  React.useEffect(() => {
    setPreviewCount(null);
  }, [audience, businessLine]);

  async function handlePreview() {
    setPreviewing(true);
    setError(null);
    const response = await previewBroadcast(audience, businessLine || undefined);
    setPreviewing(false);
    if (!response.ok) {
      setError(response.error || "Could not resolve the audience.");
      return;
    }
    setPreviewCount(response.data);
  }

  async function handleSend() {
    if (previewCount === null) return;

    const next: Record<string, string> = {};
    const titleError = requiredTextError(title, "Title", 200);
    const bodyError = requiredTextError(body, "Message", 2000);
    if (titleError) next.title = titleError;
    if (bodyError) next.body = bodyError;
    if (href.trim() && !isSafeLocalHref(href.trim())) {
      next.href = "Use a same-site path beginning with one slash.";
    }
    showFieldErrors(next);
    if (Object.keys(next).length > 0) return;

    // The recipient count stays in the question and the action stays
    // unretractable -- only the presentation moves in-app.
    const confirmed = await confirm({
      title: `Send this notification to ${previewCount} ${previewCount === 1 ? "person" : "people"}?`,
      description: "Notifications cannot be recalled once sent.",
      confirmLabel: "Send notification",
      destructive: true,
    });
    if (!confirmed) return;

    setSending(true);
    setError(null);
    const response = await sendBroadcast({
      audience,
      business_line: businessLine || null,
      title: title.trim(),
      body: body.trim(),
      href: href.trim() || null,
    });
    setSending(false);
    if (!response.ok) {
      const serverErrors = apiIssuesToFieldErrors(response.issues, {
        title: "title",
        body: "body",
        href: "href",
      });
      if (Object.keys(serverErrors).length > 0) showFieldErrors(serverErrors);
      setError(response.error || "Broadcast failed to send.");
      return;
    }

    toast.success(`Sent to ${response.data} ${response.data === 1 ? "person" : "people"}.`);
    setTitle("");
    setBody("");
    setHref("");
    setPreviewCount(null);
  }

  return (
    <DashboardPage>
      {confirmDialog}
      <DashboardHeader
        title="Broadcast"
        description="Send a notification to every matching user. Preview the audience first because a broadcast cannot be undone."
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-text-secondary">
            <Send className="h-4 w-4 text-brand-cta" aria-hidden="true" />
            One-time notification
          </div>
        }
      />

      <DashboardPanel
        title="Broadcast composer"
        description="Choose the recipients, write the notification, then verify the exact audience count."
      >
        <div ref={composerRef}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <section
              className="space-y-5 rounded-xl border border-border bg-muted/20 p-4"
              aria-labelledby="broadcast-audience-heading"
            >
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                  Step 1
                </p>
                <h2
                  id="broadcast-audience-heading"
                  className="mt-1 flex items-center gap-2 font-semibold text-text-primary"
                >
                  <Users className="h-4 w-4" aria-hidden="true" />
                  Choose recipients
                </h2>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="broadcast-audience">Audience</Label>
                <Select
                  value={audience}
                  onValueChange={(value) => setAudience(value as BroadcastAudience)}
                >
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

              {LINE_SCOPED_AUDIENCES.has(audience) ? (
                <div className="grid gap-2">
                  <Label htmlFor="broadcast-line">Business line</Label>
                  <Select
                    value={businessLine || "any"}
                    onValueChange={(value) =>
                      setBusinessLine(
                        value === "any" ? "" : (value as "loans" | "real_estate"),
                      )
                    }
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
              ) : null}

              <div className="rounded-lg border border-border bg-card p-3 text-sm text-text-secondary">
                {previewCount === null ? (
                  "Preview the matching audience before sending."
                ) : (
                  <>
                    <span className="font-semibold text-text-primary">{previewCount}</span>{" "}
                    {previewCount === 1 ? "recipient" : "recipients"} will receive this
                    notification.
                  </>
                )}
              </div>
            </section>

            <section className="space-y-5" aria-labelledby="broadcast-message-heading">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                  Step 2
                </p>
                <h2
                  id="broadcast-message-heading"
                  className="mt-1 font-semibold text-text-primary"
                >
                  Write the notification
                </h2>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="broadcast-title">
                  Title
                  <RequiredIndicator />
                </Label>
                <Input
                  id="broadcast-title"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    clearFieldError("title");
                  }}
                  maxLength={200}
                  placeholder="e.g. Scheduled maintenance tonight"
                  aria-invalid={Boolean(fieldErrors.title)}
                  aria-describedby={fieldErrors.title ? "broadcast-title-error" : undefined}
                />
                <FieldError id="broadcast-title-error">{fieldErrors.title}</FieldError>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="broadcast-body">
                  Message
                  <RequiredIndicator />
                </Label>
                <Textarea
                  id="broadcast-body"
                  value={body}
                  onChange={(event) => {
                    setBody(event.target.value);
                    clearFieldError("body");
                  }}
                  maxLength={2000}
                  rows={4}
                  placeholder="What do they need to know?"
                  aria-invalid={Boolean(fieldErrors.body)}
                  aria-describedby={fieldErrors.body ? "broadcast-body-error" : undefined}
                />
                <FieldError id="broadcast-body-error">{fieldErrors.body}</FieldError>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="broadcast-href">Link (optional)</Label>
                <Input
                  id="broadcast-href"
                  value={href}
                  onChange={(event) => {
                    setHref(event.target.value);
                    clearFieldError("href");
                  }}
                  maxLength={300}
                  placeholder="/dashboard/..."
                  aria-invalid={Boolean(fieldErrors.href)}
                  aria-describedby={fieldErrors.href ? "broadcast-href-error" : undefined}
                />
                <FieldError id="broadcast-href-error">{fieldErrors.href}</FieldError>
              </div>
            </section>
          </div>

          {error ? (
            <p role="alert" className="mt-4 text-sm text-error">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handlePreview()}
              disabled={previewing || sending}
            >
              {previewing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Preview audience
            </Button>

            <Button
              type="button"
              onClick={() => void handleSend()}
              disabled={previewCount === null || sending}
              className="ml-auto"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Send broadcast
            </Button>
          </div>
        </div>
      </DashboardPanel>
    </DashboardPage>
  );
}
