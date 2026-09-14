import { CookiesContent } from "@/components/help/cookies-content";
import { DashboardBackLink, DashboardPage } from "@/features/dashboard/dashboard-ui";
export default function Page() { return <DashboardPage><DashboardBackLink href="/dashboard">Back to dashboard</DashboardBackLink><CookiesContent dashboard /></DashboardPage>; }
