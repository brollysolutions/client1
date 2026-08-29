import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function* sourceFiles(directory: string): Generator<string> {
  for (const entry of readdirSync(directory)) {
    const target = join(directory, entry);
    if (statSync(target).isDirectory()) {
      yield* sourceFiles(target);
    } else if (target.endsWith(".tsx") || target.endsWith(".ts")) {
      yield target;
    }
  }
}

describe("dashboard interaction contract", () => {
  it("provides a first-focus bypass to the dashboard main content", () => {
    const shell = source("features/dashboard/app-shell.tsx");

    expect(shell).toContain('href="#dashboard-main-content"');
    expect(shell).toContain('id="dashboard-main-content"');
    expect(shell).toContain("Skip to main content");
    expect(shell.indexOf('href="#dashboard-main-content"')).toBeLessThan(
      shell.indexOf('aria-label="Open menu"'),
    );
  });

  it("keeps shared navigation and overlay motion optional", () => {
    const guardedSurfaces = [
      "features/dashboard/app-shell.tsx",
      "features/dashboard/app-sidebar.tsx",
      "features/dashboard/dashboard-ui.tsx",
      "components/ui/button.tsx",
      "components/ui/dialog.tsx",
      "components/ui/sheet.tsx",
      "components/ui/dropdown-menu.tsx",
      "components/ui/popover.tsx",
      "components/ui/tooltip.tsx",
      "components/ui/select.tsx",
      "components/ui/accordion.tsx",
      "components/ui/tabs.tsx",
    ];

    for (const path of guardedSurfaces) {
      expect(source(path), path).toContain("motion-reduce:");
    }
  });

  it("uses explicit transition properties instead of transition-all", () => {
    const offenders: string[] = [];

    for (const directory of ["app", "components", "features", "lib"]) {
      for (const file of sourceFiles(join(ROOT, directory))) {
        if (file.includes(".test.")) continue;
        if (source(file.slice(ROOT.length + 1)).includes("transition-all")) {
          offenders.push(file.slice(ROOT.length + 1).replaceAll("\\", "/"));
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("gives the shared button restrained press feedback with a static fallback", () => {
    const button = source("components/ui/button.tsx");

    expect(button).toContain("active:scale-[0.98]");
    expect(button).toContain("motion-reduce:active:scale-100");
    expect(button).toContain("motion-reduce:transition-none");
  });
});
