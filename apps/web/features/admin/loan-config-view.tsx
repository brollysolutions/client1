"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BankAvailabilityView } from "./bank-availability-view";
import { BanksView } from "./banks-view";
import { LoanTypesView } from "./loan-types-view";

// FR-6.3/FR-6.4: loan types + banks + which bank offers which loan type, all
// config-driven ("no developer involvement"). Three tabs share one page
// because creating a loan type or bank changes the availability tab's axes --
// each tab's hook reloads independently on its own mutations, and switching
// tabs re-fetches, so a change on one tab is never stale on another.
export function LoanConfigView() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-10">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Loan configuration</h1>
        <p className="text-sm text-text-secondary">
          Manage loan types, banks, and which bank offers which loan type -- no code change or
          deploy needed.
        </p>
      </div>

      <Tabs defaultValue="loan-types">
        <TabsList>
          <TabsTrigger value="loan-types">Loan types</TabsTrigger>
          <TabsTrigger value="banks">Banks</TabsTrigger>
          <TabsTrigger value="availability">Availability</TabsTrigger>
        </TabsList>
        <TabsContent value="loan-types" className="mt-4">
          <LoanTypesView />
        </TabsContent>
        <TabsContent value="banks" className="mt-4">
          <BanksView />
        </TabsContent>
        <TabsContent value="availability" className="mt-4">
          <BankAvailabilityView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
