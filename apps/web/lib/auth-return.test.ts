import { describe, expect, it } from "vitest";

import {
  dashboardReturnTo,
  isPropertyReturnTo,
  registrationServiceLinesForReturn,
} from "@/lib/auth-return";

describe("dashboardReturnTo", () => {
  it("preserves an exact property destination", () => {
    const path = "/dashboard/properties/123e4567-e89b-42d3-a456-426614174000";
    expect(dashboardReturnTo(path)).toBe(path);
  });

  it.each([null, "/contact", "//attacker.example/dashboard", "https://attacker.example"])(
    "falls back for an invalid destination: %s",
    (path) => {
      expect(dashboardReturnTo(path)).toBe("/dashboard");
    },
  );
});

describe("isPropertyReturnTo", () => {
  it("recognizes only a UUID-backed property route", () => {
    expect(
      isPropertyReturnTo(
        "/dashboard/properties/123e4567-e89b-42d3-a456-426614174000",
      ),
    ).toBe(true);
    expect(isPropertyReturnTo("/dashboard/properties/not-a-property")).toBe(false);
    expect(isPropertyReturnTo("/dashboard/explore")).toBe(false);
  });
});

describe("registrationServiceLinesForReturn", () => {
  it("preselects Real Estate only for a canonical property handoff", () => {
    expect(
      registrationServiceLinesForReturn(
        "/dashboard/properties/123e4567-e89b-42d3-a456-426614174000",
      ),
    ).toEqual(["real_estate"]);
    expect(registrationServiceLinesForReturn("/dashboard")).toEqual([]);
  });
});
