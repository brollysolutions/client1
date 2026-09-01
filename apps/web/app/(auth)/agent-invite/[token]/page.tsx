import type { Metadata } from "next";

import { AgentInvitePasswordView } from "@/features/auth/invite-password-view";

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
  return <AgentInvitePasswordView token={token} />;
}
