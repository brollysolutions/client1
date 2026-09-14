"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserRound, Headset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { DashboardHeader, DashboardPage, DashboardPanel } from "./dashboard-ui";
import { FetchError } from "./fetch-error";
import { getJourneyContacts, type JourneyContacts } from "@/lib/journey-contacts";

export function JourneyTeam({ line }: { line: "loans" | "real_estate" }) {
  const [data, setData] = useState<JourneyContacts | null>(null);
  const [error, setError] = useState<{ status: number | null; message: string } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null); setError(null);
    void getJourneyContacts(line).then((result) => {
      if (!active) return;
      if (result.ok) setData(result.data);
      else setError({ status: result.status, message: result.error });
    });
    return () => { active = false; };
  }, [line, revision]);
  return <DashboardPage>
    <DashboardHeader title={line === "loans" ? "My Loan Officer" : "My Agent"} description="Your introducing agent and assigned staff, with their responsibilities shown separately." />
    {error ? <FetchError status={error.status} message={error.message} onRetry={() => setRevision((value) => value + 1)} /> : !data ? <Skeleton className="h-56 rounded-xl" /> : <div className="grid gap-5 md:grid-cols-2">
      {([
        ["Introduced by", data.introducing_agent, "No active introducing agent is linked to this enquiry."],
        [line === "loans" ? "Assigned loan officer" : "Assigned property coordinator", data.assigned_staff, "Staff assignment is pending. Our team will assign someone when capacity is available."],
      ] as const).map(([title, contact, empty]) => <DashboardPanel key={title} title={title}>{contact ? <div className="flex items-center gap-4"><UserAvatar name={contact.name} size="lg" /><div><p className="font-semibold">{contact.name}</p><p className="mt-1 text-sm text-text-secondary">{contact.role === "agent" ? "Agent" : "Telecaller"} · {contact.code}</p></div></div> : <div className="flex items-start gap-3"><UserRound className="h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true" /><p className="text-sm leading-6 text-text-secondary">{empty}</p></div>}</DashboardPanel>)}
    </div>}
    <DashboardPanel title="Need help with the next step?" description="Registration links your enquiry to your account. Application approval and staff assignment are separate steps."><Button asChild><Link href="/dashboard/support"><Headset aria-hidden="true" />Contact support</Link></Button></DashboardPanel>
  </DashboardPage>;
}
