import { TermsContent } from "@/components/help/terms-content";
import { DashboardBackLink, DashboardPage } from "@/features/dashboard/dashboard-ui";
export default function Page() { return <DashboardPage><DashboardBackLink href="/dashboard">Back to dashboard</DashboardBackLink><TermsContent dashboard /></DashboardPage>; }
