import { BuildingIcon, CheckIcon, LandmarkIcon, type LucideIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LeadDialog } from "@/components/lead-dialog";
import { cn } from "@/lib/utils";
import type { LeadBusinessLine } from "@/lib/leads";

// The two business lines a visitor self-selects. Copy voice matches the hero
// (components/hero-carousel.tsx). Accent is subtle and PER CARD — loans green,
// real estate amber — never blended on one card (line-segregation rule).
type Line = {
  id: string; // hero CTA anchor target (#loans / #real-estate)
  businessLine: LeadBusinessLine;
  label: string;
  icon: LucideIcon;
  title: string;
  benefits: string[];
  accent: {
    border: string; // top-border tint
    chip: string; // icon chip bg
    icon: string; // icon color
    check: string; // bullet tick color
  };
};

const LINES: Line[] = [
  {
    id: "loans",
    businessLine: "loans",
    label: "Loans",
    icon: LandmarkIcon,
    title: "Find the loan that fits you",
    benefits: [
      "Home, personal, and business loans compared in one place",
      "Matched to your profile, not a generic rate card",
      "Trusted banks and lenders, KYC-checked partners",
    ],
    accent: {
      border: "border-t-loans-accent",
      chip: "bg-loans-soft",
      icon: "text-loans-accent",
      check: "text-loans-accent",
    },
  },
  {
    id: "real-estate",
    businessLine: "real_estate",
    label: "Real Estate",
    icon: BuildingIcon,
    title: "Buy, rent, and list with confidence",
    benefits: [
      "Verified properties and agents across the city",
      "One place to buy, rent, or list your home",
      "Guided every step, so you stay in control",
    ],
    accent: {
      border: "border-t-realestate-accent",
      chip: "bg-realestate-soft",
      icon: "text-realestate-accent",
      check: "text-realestate-accent",
    },
  },
];

export function LineSplit() {
  return (
    <section
      aria-labelledby="line-split-heading"
      className="w-full bg-[var(--nav-bg)] py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="line-split-heading"
            className="font-heading text-2xl font-semibold text-brand-navy sm:text-3xl lg:text-4xl"
          >
            Choose your path
          </h2>
          <p className="mt-3 text-base text-text-secondary sm:text-lg">
            Two lines, one bridge between you and the banks. Pick where you want
            to start and we&apos;ll take it from there.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:mt-14 sm:grid-cols-2 lg:gap-8">
          {LINES.map((line) => {
            const Icon = line.icon;
            return (
              <Card
                key={line.id}
                id={line.id}
                // scroll-mt clears the sticky 64px NavBar when the hero CTA
                // anchors jump here.
                className={cn(
                  "scroll-mt-24 border-t-4 transition-shadow hover:shadow-md",
                  line.accent.border
                )}
              >
                <CardHeader>
                  <span
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-lg",
                      line.accent.chip
                    )}
                  >
                    <Icon
                      className={cn("h-6 w-6", line.accent.icon)}
                      aria-hidden
                    />
                  </span>
                  <span
                    className={cn(
                      "mt-4 text-xs font-semibold uppercase tracking-wide",
                      line.accent.icon
                    )}
                  >
                    {line.label}
                  </span>
                  <CardTitle className="font-heading text-xl text-brand-navy sm:text-2xl">
                    {line.title}
                  </CardTitle>
                  <CardDescription className="sr-only">
                    {line.label} highlights
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <ul className="space-y-3">
                    {line.benefits.map((benefit) => (
                      <li key={benefit} className="flex items-start gap-3">
                        <CheckIcon
                          className={cn(
                            "mt-0.5 h-5 w-5 shrink-0",
                            line.accent.check
                          )}
                          aria-hidden
                        />
                        <span className="text-sm text-foreground sm:text-base">
                          {benefit}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter>
                  <LeadDialog businessLine={line.businessLine} />
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
