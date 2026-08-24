import { DocumentsView } from "@/features/dashboard/documents-view";
import { DashboardHeader, DashboardPage } from "@/features/dashboard/dashboard-ui";

export default function DocumentsPage() {
  return (
    <DashboardPage>
      <DashboardHeader
        title="Loan media"
        description="Upload and review private photos, documents, and videos grouped by application."
      />
      <DocumentsView />
    </DashboardPage>
  );
}
