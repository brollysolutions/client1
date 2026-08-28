import type { Metadata } from "next";

import { StaffInviteView } from "@/features/public/staff-invite-view";

// noindex for the same reason the contact invitation is: the URL is the
// credential, and a crawled link is a leaked one.
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
  return <StaffInviteView token={token} />;
}
