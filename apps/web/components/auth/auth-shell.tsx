import type { ReactNode } from "react";
import { AuthSupport } from "./auth-support";
import { Logo } from "@/components/logo";

import { BrandPanel, type AuthScene } from "./brand-panel";
import { AuthLegalLinks } from "./auth-legal-links";

// Split-screen frame for every auth screen: navy brand panel on the left (lg+),
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
    <div className="min-h-dvh w-full bg-surface lg:grid lg:h-dvh lg:grid-cols-[minmax(0,3fr)_minmax(400px,2fr)]">
      <BrandPanel
        title={panelTitle}
        subtitle={panelSubtitle}
        steps={steps}
        activeStep={activeStep}
        scene={scene}
        className="hidden lg:flex"
      />

      <div className="relative min-w-0 px-4 sm:px-10 lg:h-dvh lg:overflow-y-auto lg:px-12 xl:px-16">
        <div className="flex min-h-dvh flex-col justify-center py-8 sm:py-10 lg:min-h-full">
          <div className="auth-anim-fade-up mx-auto w-full max-w-md">
            <div className="mb-6 flex items-center justify-between gap-3 border-b border-border pb-5">
              <Logo className="w-40 sm:w-52 lg:w-40 xl:w-52" sizes="(min-width: 1280px) 208px, (min-width: 1024px) 160px, (min-width: 640px) 208px, 160px" />
              <AuthSupport />
            </div>
            {children}
            <AuthLegalLinks />
          </div>
        </div>
      </div>
    </div>
  );
}
