import type { ReactNode } from "react";

import { BrandPanel } from "./brand-panel";

// Split-screen frame for every auth screen: navy brand panel on the left (lg+),
// centered form column on the right. Below lg the brand panel is dropped and the
// form takes the full width.
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

      <div className="relative flex min-h-screen flex-col px-6 py-10 sm:px-10 lg:px-20 xl:px-24">
        <div className="flex flex-1 flex-col justify-center pb-6">
          <div className="mx-auto w-full max-w-lg">{children}</div>
        </div>
      </div>
    </div>
  );
}
