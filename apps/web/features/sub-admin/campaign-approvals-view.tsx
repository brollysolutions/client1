"use client";

import * as React from "react";
import { CheckCircle2, Inbox, Layers3, Percent } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardHeader, DashboardPage } from "@/features/dashboard/dashboard-ui";

import { BannersView } from "./banners-view";
import { OffersView } from "./offers-view";

/**
 * Admin's single review desk for both campaign kinds.
 *
 * Authoring moved to `/dashboard/banners` and `/dashboard/offers`, one page per
 * kind, because an author works on one at a time. A reviewer works the other
 * way round -- they clear a queue -- so the two tabs stay together here.
 *
 * The desk opens filtered to `pending_approval` and each tab carries its
 * outstanding count, so a reviewer sees the workload before opening anything.
 * Previously both tabs opened on every campaign ever created, with nothing
 * distinguishing the three items that needed a decision from the hundred that
 * did not.
 */
export function CampaignApprovalsView({
  initialTab = "banners",
}: {
  initialTab?: "banners" | "offers";
}) {
  const [tab, setTab] = React.useState<"banners" | "offers">(initialTab);
  const [pendingBanners, setPendingBanners] = React.useState(0);
  const [pendingOffers, setPendingOffers] = React.useState(0);
  const waiting = pendingBanners + pendingOffers;

  return (
    <DashboardPage>
      <DashboardHeader
        title="Campaign approvals"
        description="Review the complete customer-facing composition, then approve, request changes, or remove it. Campaign fields stay read-only."
        actions={
          <span
            className={
              waiting
                ? "inline-flex items-center gap-2 rounded-full border border-warning/40 bg-warning/10 px-3 py-1.5 text-sm font-medium text-warning"
                : "inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-sm font-medium text-text-secondary"
            }
          >
            {waiting ? (
              <Inbox className="h-4 w-4" aria-hidden />
            ) : (
              <CheckCircle2 className="h-4 w-4" aria-hidden />
            )}
            {waiting
              ? `${waiting} ${waiting === 1 ? "campaign" : "campaigns"} waiting`
              : "Nothing waiting for review"}
          </span>
        }
      />
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as "banners" | "offers")}
        className="space-y-4"
      >
        <TabsList
          aria-label="Campaign type"
          className="grid h-auto w-full max-w-md grid-cols-2 rounded-xl p-1"
        >
          <TabsTrigger value="banners" className="gap-2 rounded-lg py-2.5">
            <Layers3 className="h-4 w-4" aria-hidden />
            Banners
            <PendingBadge count={pendingBanners} />
          </TabsTrigger>
          <TabsTrigger value="offers" className="gap-2 rounded-lg py-2.5">
            <Percent className="h-4 w-4" aria-hidden />
            Dashboard offers
            <PendingBadge count={pendingOffers} />
          </TabsTrigger>
        </TabsList>
        {/* Both stay mounted so a tab's pending count is known before the
            reviewer has opened it -- an empty badge would otherwise look like
            "nothing to do" on a queue that has never been rendered. */}
        <TabsContent value="banners" forceMount hidden={tab !== "banners"}>
          <BannersView
            embedded
            initialStatus="pending_approval"
            onPendingCount={setPendingBanners}
          />
        </TabsContent>
        <TabsContent value="offers" forceMount hidden={tab !== "offers"}>
          <OffersView embedded initialStatus="pending_approval" onPendingCount={setPendingOffers} />
        </TabsContent>
      </Tabs>
    </DashboardPage>
  );
}

function PendingBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span
      className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning px-1.5 text-[11px] font-semibold tabular-nums text-white"
      aria-label={`${count} awaiting review`}
    >
      {count}
    </span>
  );
}
