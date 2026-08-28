import type { Metadata } from "next";

import { AgentInviteView } from "@/features/public/agent-invite-view";

export const metadata: Metadata = {
  title: "Set up your Agent account",
  description: "Set a password for your Dhanadhara Agent account.",
  robots: { index: false, follow: false },
};

export default async function AgentInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <AgentInviteView token={token} />;
}
