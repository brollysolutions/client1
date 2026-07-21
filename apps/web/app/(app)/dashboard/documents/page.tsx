import { FolderClosed } from "lucide-react";

import { ComingSoon } from "@/features/dashboard/coming-soon";

export default function DocumentsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Documents</h1>
        <p className="text-sm text-text-secondary">
          Your KYC and loan documents, all in one place.
        </p>
      </div>
      <ComingSoon
        icon={FolderClosed}
        title="Document uploads are coming soon"
        description="Soon you'll upload your KYC documents here to speed up approvals and keep everything in one place."
        accentClassName="bg-loans-soft text-loans-accent"
      />
    </div>
  );
}
