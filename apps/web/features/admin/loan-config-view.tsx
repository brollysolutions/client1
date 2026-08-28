"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardHeader, DashboardPage } from "@/features/dashboard/dashboard-ui";
import { BanksView } from "./banks-view";
import { LoanTypesView } from "./loan-types-view";

// Products now own their form, operational provider availability, and explicit
// public offers in one workspace. The reusable provider/logo library stays a
// separate surface because provider identity and provenance span products.
export function LoanConfigView() {
  return (
    <DashboardPage>
      <DashboardHeader
        title="Financial products"
        description="Configure versioned client forms, catalogue state, and verified provider offers without mixing operational availability with public publication."
      />

      <Tabs defaultValue="products">
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="products">Product catalogue</TabsTrigger>
          <TabsTrigger value="providers">Providers &amp; logos</TabsTrigger>
        </TabsList>
        <TabsContent value="products" className="mt-4 space-y-4">
          <LoanTypesView />
        </TabsContent>
        <TabsContent value="providers" className="mt-4">
          <BanksView />
        </TabsContent>
      </Tabs>
    </DashboardPage>
  );
}
