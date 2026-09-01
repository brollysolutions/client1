import type { Metadata } from "next";

import { StaffInvitePasswordView } from "@/features/auth/invite-password-view";

export const metadata: Metadata = {
  title: "Set up your account",
  description: "Set a password for your Dhanadhara staff account.",
  robots: { index: false, follow: false },
};

export default async function StaffInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <StaffInvitePasswordView token={token} />;
}
