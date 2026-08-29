import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CampaignPreviewPanel } from "@/features/sub-admin/campaign-preview-panel";
import { VIEWPORT_WIDTHS, viewportLabel } from "@/features/dashboard/viewport-frame";

const ROOT = process.cwd();
const SEARCHED = ["app", "components", "features", "lib"];

function* sourceFiles(directory: string): Generator<string> {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      yield* sourceFiles(path);
      continue;
    }
    if (path.endsWith(".tsx") || path.endsWith(".ts")) yield path;
  }
}

describe("in-app confirmation", () => {
  it("leaves no native confirm in application code", () => {
    // A native confirm renders as browser chrome pinned to the top of the
    // window, detached from the workspace that triggered it -- reported as
    // "popping from top of the chrome browser". `useConfirm` replaces it, and
    // this keeps it replaced.
    const offenders: string[] = [];
    for (const directory of SEARCHED) {
      for (const file of sourceFiles(join(ROOT, directory))) {
        // The hook's own module documents what it replaces.
        if (file.endsWith(join("components", "ui", "confirm-dialog.tsx"))) continue;
        if (file.endsWith("confirm-dialog.test.tsx")) continue;
        const source = readFileSync(file, "utf8");
        if (/window\.confirm\s*\(/.test(source) || /(?<![.\w])confirm\s*\(\s*["'`]/.test(source)) {
          offenders.push(file.slice(ROOT.length + 1).replaceAll("\\", "/"));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("campaign preview viewports", () => {
  it("offers exactly the two widths that bracket the layout", () => {
    // A tablet preview sat between two sizes that already bracket every
    // breakpoint, and each extra control is one more thing to check before
    // shipping a campaign.
    expect(Object.keys(VIEWPORT_WIDTHS).sort()).toEqual(["desktop", "mobile"]);
    expect(VIEWPORT_WIDTHS.desktop).toBe(1440);
    expect(VIEWPORT_WIDTHS.mobile).toBe(390);
    expect(viewportLabel("mobile")).toBe("Phone");
    expect(viewportLabel("desktop")).toBe("Desktop");
  });

  it("renders one control per viewport and no tablet", () => {
    const markup = renderToStaticMarkup(
      <CampaignPreviewPanel device="desktop" onDeviceChange={() => undefined} caption="Homepage hero">
        <p>preview body</p>
      </CampaignPreviewPanel>,
    );
    expect(markup).toContain('aria-label="Desktop preview"');
    expect(markup).toContain('aria-label="Phone preview"');
    expect(markup).not.toContain("Tablet");
    expect(markup).toContain("Desktop · 1440px");
  });
});
