"use client";

import * as React from "react";
import Link from "next/link";
import { Images, Layers3 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardHeader, DashboardPage } from "@/features/dashboard/dashboard-ui";

import { BannersView } from "./banners-view";
import { OffersView } from "./offers-view";

export function CampaignStudioView({ initialTab = "banners" }: { initialTab?: "banners" | "offers" }) {
  const { session } = useAuth();
  const isAdmin = session?.role === "admin";

  return (
    <DashboardPage>
      <DashboardHeader
        title={isAdmin ? "Campaign approvals" : "Campaign Studio"}
        description={
          isAdmin
            ? "Review the complete customer-facing composition, then approve, request changes, or remove it. Campaign fields stay read-only."
            : "Create banners and dashboard offers as one team, reuse governed artwork, and send complete campaigns to Admin."
        }
        actions={
          isAdmin ? undefined : (
            <Button asChild variant="outline"><Link href="/dashboard/media-library"><Images className="h-4 w-4" />Media library</Link></Button>
          )
        }
      />
      <Tabs defaultValue={initialTab} className="space-y-4">
        <TabsList aria-label="Campaign type" className="grid h-auto w-full max-w-md grid-cols-2 rounded-xl p-1">
          <TabsTrigger value="banners" className="gap-2 rounded-lg py-2.5"><Layers3 className="h-4 w-4" />Banners</TabsTrigger>
          <TabsTrigger value="offers" className="gap-2 rounded-lg py-2.5"><span aria-hidden>％</span>Dashboard offers</TabsTrigger>
        </TabsList>
        <TabsContent value="banners"><BannersView embedded /></TabsContent>
        <TabsContent value="offers"><OffersView embedded /></TabsContent>
      </Tabs>
    </DashboardPage>
  );
}
