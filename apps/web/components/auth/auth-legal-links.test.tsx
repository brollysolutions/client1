import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthLegalLinks } from "./auth-legal-links";

describe("auth legal navigation", () => {
  it("labels both new-tab destinations without submitting or replacing a form", () => {
    const markup = renderToStaticMarkup(<AuthLegalLinks />);
    expect(markup).toContain('aria-label="Account legal information"');
    expect(markup).toContain('href="/privacy"');
    expect(markup).toContain('href="/terms"');
    expect(markup.match(/target="_blank"/g)).toHaveLength(2);
    expect(markup.match(/rel="noopener noreferrer"/g)).toHaveLength(2);
    expect(markup.match(/opens in a new tab/g)).toHaveLength(2);
    expect(markup).toContain("Legal pages open in a new tab.");
    expect(markup).not.toContain("<button");
  });
});
