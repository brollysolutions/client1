import { DashboardPropertyDetail } from "@/features/real-estate/dashboard-property-detail";

export default async function DashboardPropertyPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  return <DashboardPropertyDetail propertyId={propertyId} />;
}
