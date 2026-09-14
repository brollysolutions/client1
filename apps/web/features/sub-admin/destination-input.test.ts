import { describe, expect, it } from "vitest";
import { destinationOptions } from "./destination-input";

describe("campaign destination suggestions", () => {
  it("keeps public suggestions free of private workspace routes", () => {
    const options = destinationOptions({ dashboard: false });
    expect(options.some((option) => option.href === "/help-center")).toBe(true);
    expect(options.every((option) => !option.href.startsWith("/dashboard"))).toBe(true);
  });

  it("follows recipient capabilities and the campaign line", () => {
    const options = destinationOptions({ dashboard: true, businessLine: "real_estate", audienceRoles: ["client"] });
    expect(options.some((option) => option.href === "/dashboard/site-visits")).toBe(true);
    expect(options.some((option) => option.href === "/dashboard/documents")).toBe(false);
    expect(options.some((option) => option.href === "/dashboard/users")).toBe(false);
  });

  it("only suggests shared workspace routes for a mixed audience", () => {
    const options = destinationOptions({ dashboard: true, businessLine: "both", audienceRoles: ["client", "employee"] });
    expect(options.some((option) => option.href === "/dashboard/support")).toBe(true);
    expect(options.some((option) => option.href === "/dashboard/tasks")).toBe(false);
    expect(options.some((option) => option.href === "/dashboard/explore")).toBe(false);
  });
});
