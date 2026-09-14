import { PrivacyContent } from "@/components/help/privacy-content";
import { DashboardBackLink, DashboardPage } from "@/features/dashboard/dashboard-ui";
export default function Page() { return <DashboardPage><DashboardBackLink href="/dashboard">Back to dashboard</DashboardBackLink><PrivacyContent dashboard /></DashboardPage>; }
