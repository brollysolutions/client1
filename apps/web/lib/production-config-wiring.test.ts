import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const dockerfile = readFileSync(
  fileURLToPath(new URL("../Dockerfile", import.meta.url)),
  "utf8",
);
const productionCompose = readFileSync(
  fileURLToPath(new URL("../../../docker-compose.prod.example.yml", import.meta.url)),
  "utf8",
);

const PUBLIC_IDENTITY_KEYS = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_CONTACT_PHONE",
  "NEXT_PUBLIC_CONTACT_EMAIL",
  "NEXT_PUBLIC_CONTACT_HOURS",
  "NEXT_PUBLIC_CONTACT_ADDRESS",
] as const;

describe("production public-identity wiring", () => {
  it("enables strict public configuration in the deployable image", () => {
    expect(dockerfile).toContain("DHANADHARA_REQUIRE_PUBLIC_CONFIG=true");
  });

  it.each(PUBLIC_IDENTITY_KEYS)("passes %s through build and runtime stages", (key) => {
    expect(dockerfile.match(new RegExp(`ARG ${key}`, "g"))).toHaveLength(2);
    expect(dockerfile.match(new RegExp(`${key}=\\$\\{${key}\\}`, "g"))).toHaveLength(2);
    expect(productionCompose).toContain(`${key}: \${${key}?`);
  });
});
