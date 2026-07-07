import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Minimal test config. Mirrors the two tsconfig path aliases so unit tests can
// import app modules (@/*) and the generated contract types (@contracts/*).
export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "@contracts": fileURLToPath(new URL("../../packages/contracts", import.meta.url)),
    },
  },
});
