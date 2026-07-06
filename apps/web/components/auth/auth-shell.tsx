import type { ReactNode } from "react";

import { BrandPanel } from "./brand-panel";

// Split-screen frame for every auth screen: navy brand panel on the left (lg+),
// centered form column on the right. Below lg the brand panel is replaced by a
// compact brand + steps header so the form gets the full width.
export function AuthShell({
  panelTitle,
  panelSubtitle,
  steps,
  activeStep,
  children,
}: {
  panelTitle: string;
  panelSubtitle: string;
  steps?: string[];
  activeStep?: number;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-background lg:grid lg:grid-cols-2">
      <BrandPanel
        title={panelTitle}
        subtitle={panelSubtitle}
        steps={steps}
        activeStep={activeStep}
        className="hidden min-h-screen lg:flex"
      />

      <div className="relative flex min-h-screen flex-col px-6 py-8 sm:px-10 lg:px-16">
        {/* Mobile/tablet brand mark (brand panel is hidden < lg). The step
            indicator is intentionally omitted here to keep the form compact on
            phones — it still shows on the lg+ brand panel. */}
        <div className="mb-10 flex items-center gap-2 lg:hidden">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-navy text-xs font-bold text-white">
            LR
          </span>
          <span className="font-heading text-base font-semibold text-text-primary">
            Loans &amp; Real Estate
          </span>
        </div>

        <div className="flex flex-1 flex-col justify-center pb-6">
          <div className="mx-auto w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  );
}
