import type { Metadata } from "next";
import { HelpCenter } from "@/components/help/help-center";

export const metadata: Metadata = {
  title: "Get Started | Dhanadhara",
  description: "Set up your Dhanadhara account, explore financial services and real estate, and learn how to track the next step.",
  alternates: { canonical: "/get-started" },
  openGraph: { title: "Get Started | Dhanadhara", description: "Set up your Dhanadhara account, explore financial services and real estate, and learn how to track the next step.", url: "/get-started", images: ["/brand/social.png"] },
};

export default function Page() {
  return <HelpCenter started={true} />;
}
