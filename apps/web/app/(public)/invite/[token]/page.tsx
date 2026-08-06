import type { Metadata } from "next";

import { ContactInvitationView } from "@/features/public/contact-invitation-view";

export const metadata: Metadata = {
  title: "Secure invitation",
  description: "A private invitation to contact Dhanadhara.",
  robots: { index: false, follow: false },
};

export default async function ContactInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ContactInvitationView token={token} />;
}

