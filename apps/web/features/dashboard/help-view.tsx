"use client";
import { useAuth } from "@/components/auth/session-provider";
import { useLine } from "./line-provider";
import { HelpCenter } from "@/components/help/help-center";

export function DashboardHelp({ started = false }: { started?: boolean }) {
  const { session } = useAuth();
  const { activeLine, lines } = useLine();
  return session ? <HelpCenter role={session.role} started={started} access={{ role: session.role, businessLine: session.businessLine, activeLine, profileLines: lines, staffFeatures: session.staffFeatures }} /> : null;
}
