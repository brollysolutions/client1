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
    <div className="min-h-dvh w-full bg-background lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(400px,2fr)]">
      <BrandPanel
        title={panelTitle}
        subtitle={panelSubtitle}
        steps={steps}
        activeStep={activeStep}
        className="hidden lg:flex"
      />

      <div className="relative px-6 sm:px-10 lg:px-12 xl:px-16">
        <div className="flex min-h-dvh flex-col justify-center py-6">
          <div className="auth-anim-fade-up mx-auto w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  );
}
