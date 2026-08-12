"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteAccount } from "@/lib/auth";

// Confirmation dialog for self-service account deletion (SRS 5.1). Re-entering
// the current password is the reconfirmation step the SRS calls for ("a
// warning and confirmation step") — the same bar change-password already uses
// for a security-sensitive action taken from within a live session.
export function DeleteAccountDialog() {
  const router = useRouter();
  const { clear } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function resetAndClose() {
    setPassword("");
    setError(null);
    setOpen(false);
  }

  async function onConfirm() {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    const res = await deleteAccount(password);
    setBusy(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    // The server has already blacklisted this access token and cleared the
    // refresh cookie, so there is no live session left to log out of — just
    // drop the local state and leave.
    clear();
    toast.success("Your account has been deleted.");
    router.replace("/");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : resetAndClose())}>
      <DialogTrigger asChild>
        <Button variant="destructive">Delete account</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            Your name, contact details, and any KYC documents are permanently erased. Your
            transaction history is retained for 7 years as required by financial record-keeping
            rules, but is no longer linked to you. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="delete-account-password">Enter your password to confirm</Label>
          <Input
            id="delete-account-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void onConfirm()} disabled={!password || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? "Deleting…" : "Delete account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
