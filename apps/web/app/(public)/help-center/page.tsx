import type { Metadata } from "next";
import { HelpCenter } from "@/components/help/help-center";

export const metadata: Metadata = {
  title: "Help Center | Dhanadhara",
  description: "Find answers about Dhanadhara accounts, recovery, enquiries, documents, referrals and support.",
  alternates: { canonical: "/help-center" },
  openGraph: { title: "Help Center | Dhanadhara", description: "Find answers about Dhanadhara accounts, recovery, enquiries, documents, referrals and support.", url: "/help-center", images: ["/brand/social.png"] },
};

export default function Page() {
  return <HelpCenter started={false} />;
}
