import type { ReactNode } from "react";

import { AnnouncementBanner } from "@/components/announcement-banner";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AnnouncementBanner />
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
