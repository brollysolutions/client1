"use client";

import Link from "next/link";
import { Headset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SITE_CONTACT } from "@/lib/site";

export function AuthSupport() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" className="min-h-11"><Headset aria-hidden="true" />Support</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader className="pr-9 text-left">
          <DialogTitle>Help signing in</DialogTitle>
          <DialogDescription>Recover access or reach the support team.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 text-sm leading-6">
          <p className="text-text-secondary">
            For a missing code, check your number and network, then use Resend when the
            countdown finishes. Never share your password or verification code.
          </p>
          <nav aria-label="Account recovery" className="grid gap-2">
            {[
              ["/forgot-password", "Reset your password"],
              ["/change-mobile", "Recover access with a new mobile number"],
              ["/help-center", "Browse the Help Center"],
            ].map(([href, label]) => (
              <Link key={href} href={href} className="pressable rounded-lg border border-border px-4 py-3 font-medium text-brand-link hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-border pt-4">
            <h3 className="font-semibold">Contact support</h3>
            <a className="mt-2 flex min-h-11 items-center text-brand-link underline underline-offset-4" href={SITE_CONTACT.phoneHref}>{SITE_CONTACT.phone}</a>
            <a className="flex min-h-11 items-center break-all text-brand-link underline underline-offset-4" href={SITE_CONTACT.emailHref}>{SITE_CONTACT.email}</a>
            <p className="mt-3 text-text-secondary">{SITE_CONTACT.hours.join(" · ")}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
