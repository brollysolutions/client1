import { defineConfig } from "@playwright/test";

const webOrigin = "http://127.0.0.1:3101";
const catalogueOrigin = "http://127.0.0.1:4311";

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["financial-services.spec.ts", "registration-profile.spec.ts", "frontend-performance.spec.ts"],
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "list",
  webServer: [
    {
      command: "node e2e/fixtures/release-catalogue-server.mjs",
      url: `${catalogueOrigin}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "node e2e/fixtures/start-release-artifact.mjs",
      url: webOrigin,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        API_INTERNAL_URL: catalogueOrigin,
      },
    },
  ],
  use: {
    baseURL: webOrigin,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
