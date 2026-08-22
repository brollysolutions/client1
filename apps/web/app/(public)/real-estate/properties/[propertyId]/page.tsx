import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, PhoneCall } from "lucide-react";

import { PropertyDetailView } from "@/components/property-detail-view";
import { Button } from "@/components/ui/button";
import { contactHref } from "@/lib/leads";
import { getPublicProperty } from "@/lib/public-properties";
import { SITE_URL } from "@/lib/site";

type PageProps = { params: Promise<{ propertyId: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { propertyId } = await params;
  const result = await getPublicProperty(propertyId);
  if (!result.ok) {
    return { title: "Property details" };
  }
  const property = result.data;
  const description = `${property.title} in ${property.location}. ${property.price}. View approved property facts and contact Dhanadhara for the next step.`;
  return {
    title: `${property.title} in ${property.location}`,
    description,
    alternates: { canonical: `/real-estate/properties/${property.id}` },
    openGraph: {
      title: property.title,
      description,
      type: "website",
      url: `/real-estate/properties/${property.id}`,
      ...(property.image ? { images: [{ url: property.image }] } : {}),
    },
  };
}

export default async function PublicPropertyPage({ params }: PageProps) {
  const { propertyId } = await params;
  const result = await getPublicProperty(propertyId);
  if (!result.ok) {
    if (result.status === 404 || result.status === 422) notFound();
    return (
      <section className="min-h-[70vh] bg-[var(--nav-bg)] px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-xl rounded-2xl border border-[var(--nav-border)] bg-card p-8 text-center">
          <h1 className="font-heading text-3xl font-semibold text-foreground">
            Property details are temporarily unavailable
          </h1>
          <p className="mt-3 text-text-secondary">
            Please try again shortly, or return to the property catalog.
          </p>
          <Button asChild className="mt-6 bg-[var(--nav-primary)] text-white hover:bg-[var(--nav-primary-hover)]">
            <Link href="/real-estate">Back to properties</Link>
          </Button>
        </div>
      </section>
    );
  }

  const property = result.data;
  const dashboardHref = `/dashboard/properties/${property.id}`;
  const propertyJsonLd = {
    "@context": "https://schema.org",
    "@type": "Residence",
    name: property.title,
    url: `${SITE_URL}/real-estate/properties/${property.id}`,
    address: {
      "@type": "PostalAddress",
      addressLocality: property.locality,
      addressRegion: property.state,
      postalCode: property.pincode,
      addressCountry: "IN",
    },
    ...(property.image ? { image: property.image } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(propertyJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <PropertyDetailView
        listing={property}
        backHref="/real-estate"
        backLabel="Back to properties"
        actions={
          <>
            <Button asChild className="min-h-11 w-full bg-[var(--nav-primary)] text-white hover:bg-[var(--nav-primary-hover)]">
              <Link
                href={contactHref({
                  line: "real_estate",
                  product: `${property.title}, ${property.location}`,
                  propertyRef: property.id,
                })}
              >
                <PhoneCall className="h-4 w-4" aria-hidden />
                Contact team
              </Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11 w-full border-[var(--nav-primary)] text-[var(--nav-primary)] hover:bg-[var(--nav-tint)] hover:text-[var(--nav-primary-hover)]">
              <Link href={dashboardHref}>
                <ExternalLink className="h-4 w-4" aria-hidden />
                <span className="sm:hidden">Open app</span>
                <span className="hidden sm:inline">Open in Dhanadhara</span>
              </Link>
            </Button>
          </>
        }
      />
    </>
  );
}
