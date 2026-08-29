"use client";

import * as React from "react";
import { Layers3 } from "lucide-react";

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
 */
export function CampaignApprovalsView({
  initialTab = "banners",
}: {
  initialTab?: "banners" | "offers";
}) {
  return (
    <DashboardPage>
      <DashboardHeader
        title="Campaign approvals"
        description="Review the complete customer-facing composition, then approve, request changes, or remove it. Campaign fields stay read-only."
      />
      <Tabs defaultValue={initialTab} className="space-y-4">
        <TabsList
          aria-label="Campaign type"
          className="grid h-auto w-full max-w-md grid-cols-2 rounded-xl p-1"
        >
          <TabsTrigger value="banners" className="gap-2 rounded-lg py-2.5">
            <Layers3 className="h-4 w-4" aria-hidden />
            Banners
          </TabsTrigger>
          <TabsTrigger value="offers" className="gap-2 rounded-lg py-2.5">
            <span aria-hidden>%</span>
            Dashboard offers
          </TabsTrigger>
        </TabsList>
        <TabsContent value="banners">
          <BannersView embedded />
        </TabsContent>
        <TabsContent value="offers">
          <OffersView embedded />
        </TabsContent>
      </Tabs>
    </DashboardPage>
  );
}
