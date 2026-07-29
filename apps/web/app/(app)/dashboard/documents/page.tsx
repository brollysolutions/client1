import { DocumentsView } from "@/features/dashboard/documents-view";

export default function DocumentsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Documents</h1>
        <p className="text-sm text-text-secondary">
          Your KYC and loan documents, all in one place.
        </p>
      </div>
      <DocumentsView />
    </div>
  );
}
