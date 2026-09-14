import { defineConfig } from "@playwright/test";
import release from "./playwright.release.config";

// Dedicated synthetic UI gate; no live accounts or delivery services.
export default defineConfig({
  ...release,
  testMatch: ["mobile-layout.spec.ts", "ui-refinement.spec.ts", "sidebar-layout.spec.ts", "loading-pages.spec.ts", "brand.spec.ts", "registration-profile.spec.ts", "lead-assignment.spec.ts", "financial-services.spec.ts", "service-directory.spec.ts", "admin-financial-products.spec.ts", "frontend-performance.spec.ts"],
  webServer: (Array.isArray(release.webServer) ? release.webServer : []).map((server, index) =>
    index === 0 ? { ...server, command: `${server.command} --published-banners` } : server,
  ),
});
