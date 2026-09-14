import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProviderLogo } from "./provider-logo";

describe("provider logo", () => {
  it("keeps white wordmarks legible independently of theme", () => {
    const markup = renderToStaticMarkup(<ProviderLogo url="/provider-logos/axis.svg" sizes="64px" />);
    expect(markup).toContain("bg-[#182648]");
    expect(markup).toContain("/provider-logos/axis.svg");
    expect(markup).not.toContain("brightness-0");
  });

  it("does not render unapproved external image URLs", () => {
    const markup = renderToStaticMarkup(<ProviderLogo url="https://unapproved.example/logo.png" sizes="64px" />);
    expect(markup).not.toContain("<img");
    expect(markup).toContain("bg-transparent");
  });
});
