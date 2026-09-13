import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, expect, it, vi } from "vitest";
import { CalculatorIsland } from "./calculator-island";

vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());
vi.mock("@/lib/calculators/islands", () => ({
  ISLANDS: { emi: () => <button>Download CSV</button> },
}));

it("keeps server-rendered calculator controls behind the loading state until hydration", () => {
  const html = renderToStaticMarkup(<CalculatorIsland slug="emi" />);
  expect(html).toContain('role="status"');
  expect(html).toContain("Loading calculator");
  expect(html).not.toContain("Download CSV");
});
