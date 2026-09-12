import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

import { BrandPanel, type AuthScene } from "./brand-panel";

// Split-screen frame for every auth screen: sky brand panel on the left (lg+),
// centered form column on the right. Below lg the brand panel is dropped and the
// form takes the full width.
export function AuthShell({
  panelTitle,
  panelSubtitle,
  steps,
  activeStep,
  scene,
  children,
}: {
  panelTitle: string;
  panelSubtitle: string;
  steps?: string[];
  activeStep?: number;
  scene?: AuthScene;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh w-full bg-background lg:grid lg:h-dvh lg:grid-cols-[minmax(0,3fr)_minmax(400px,2fr)]">
      <BrandPanel
        title={panelTitle}
        subtitle={panelSubtitle}
        steps={steps}
        activeStep={activeStep}
        scene={scene}
        className="hidden lg:flex"
      />

      <div className="relative min-w-0 px-4 sm:px-10 lg:h-dvh lg:overflow-y-auto lg:px-12 xl:px-16">
        <div className="flex min-h-dvh flex-col justify-center py-6 lg:min-h-full">
          <div className="auth-anim-fade-up mx-auto w-full max-w-md">
            <Logo className="mb-8 w-52 sm:w-60" sizes="(min-width: 640px) 240px, 208px" />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
