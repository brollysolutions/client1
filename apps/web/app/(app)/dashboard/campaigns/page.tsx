"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAuth } from "@/components/auth/session-provider";
import { CampaignStudioView } from "@/features/sub-admin/campaign-studio-view";

export default function CampaignsPage() {
  const router = useRouter();
  const search = useSearchParams();
  const { session, isLoading } = useAuth();
  const allowed = session?.role === "sub_admin";
  React.useEffect(() => { if (!isLoading && !allowed) router.replace("/dashboard"); }, [allowed, isLoading, router]);
  if (isLoading || !allowed) return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-brand-blue" /></div>;
  return <CampaignStudioView initialTab={search.get("type") === "offers" ? "offers" : "banners"} />;
}
