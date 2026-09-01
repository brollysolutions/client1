import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { FORM_SURFACE_REGISTRY } from "./form-surface-registry";

const CONTROL_PATTERN =
  /<form\b|<(?:Input|Textarea|Select|Checkbox|RadioGroup|CommandInput|SearchableSelect|Slider|Switch|Toggle|ToggleGroup|MobileInput|InputOTP|PasswordField|FileField|OptionalProfileFields|PropertyDetailFields|PayoutDestinationFields|RecipientPicker|AudienceRuleFields|SliderField|IconInput|AgentApplicationForm|input|textarea|select)\b/;

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? tsxFiles(target) : entry.name.endsWith(".tsx") ? [target] : [];
  });
}

describe("form surface registry", () => {
  it("classifies every non-primitive input-bearing surface", () => {
    const webRoot = process.cwd();
    const discovered = ["app", "components", "features"]
      .flatMap((directory) => tsxFiles(path.join(webRoot, directory)))
      .filter((file) => !file.includes(`${path.sep}components${path.sep}ui${path.sep}`))
      .filter((file) => !file.includes(".test."))
      .filter((file) => CONTROL_PATTERN.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(webRoot, file).replaceAll(path.sep, "/"))
      .sort();

    expect(Object.keys(FORM_SURFACE_REGISTRY).sort()).toEqual(discovered);
  });
});
