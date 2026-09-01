import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CampaignPreviewPanel } from "@/features/sub-admin/campaign-preview-panel";
import { DESKTOP_VIEWPORT_WIDTH } from "@/features/dashboard/viewport-frame";

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

describe("campaign preview viewport", () => {
  it("previews one width and offers no size switcher", () => {
    // Tablet, then phone, were both withdrawn. With a single width left there
    // is nothing to switch between, so the control is gone rather than
    // rendered with one option.
    expect(DESKTOP_VIEWPORT_WIDTH).toBe(1440);

    const markup = renderToStaticMarkup(
      <CampaignPreviewPanel caption="Homepage hero">
        <p>preview body</p>
      </CampaignPreviewPanel>,
    );
    expect(markup).toContain("Desktop · 1440px");
    expect(markup).not.toContain('aria-label="Preview size"');
    expect(markup).not.toContain("Phone");
    expect(markup).not.toContain("Tablet");
  });
});
