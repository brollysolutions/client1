import type { ReactNode } from "react";

import { AnnouncementBanner } from "@/components/announcement-banner";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getPublishedServiceProducts } from "@/lib/financial-catalog";

// Site navigation shares Admin-controlled publication state. Individual CMS
// fetches retain their caches; the complete public page must not freeze links.
export const dynamic = "force-dynamic";

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const products = (await getPublishedServiceProducts()).map(({ slug, label, category }) => ({ slug, label, category }));
  return (
    <>
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-md bg-brand-navy px-4 py-2 text-sm font-semibold text-white shadow-lg transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 motion-reduce:transition-none"
      >
        Skip to main content
      </a>
      <AnnouncementBanner />
      <SiteHeader products={products} />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter products={products} />
    </>
  );
}
