"use client";

import { Image } from "lucide-react";

import { DASHBOARD_ICONS } from "@/features/dashboard/dashboard-icons";
import {
  DashboardHeader,
  DashboardPage,
  DashboardPanel,
  MetricCard,
  MetricGrid,
} from "@/features/dashboard/dashboard-ui";
import { BannerTemplateManager } from "@/features/sub-admin/banner-template-manager";

export function BannerMediaView() {
  return (
    <DashboardPage>
      <DashboardHeader
        title="Banner media"
        description="Own the approved raster artwork library used by banner campaigns. Replacing artwork creates an immutable version so reviewed campaigns never change underneath users."
      />
      <MetricGrid>
        <MetricCard
          label="Supported placements"
          value="5"
          hint="Homepage, ads, services, properties, dashboard"
          icon={DASHBOARD_ICONS.banners}
        />
        <MetricCard
          label="Accepted formats"
          value="3"
          hint="JPG, PNG, WEBP only"
          icon={Image}
        />
        <MetricCard
          label="Versioning"
          value="Immutable"
          hint="Existing campaigns retain reviewed media"
          icon={DASHBOARD_ICONS.auditLog}
        />
        <MetricCard
          label="Campaign authors"
          value="Sub Admin"
          hint="Authors select approved media; cannot upload"
          icon={DASHBOARD_ICONS.accessControl}
        />
      </MetricGrid>
      <DashboardPanel
        title="Approved artwork library"
        description="Review current category artwork and create a replacement version when a visual changes."
      >
        <BannerTemplateManager />
      </DashboardPanel>
    </DashboardPage>
  );
}
