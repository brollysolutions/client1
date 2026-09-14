import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { ClosingCtaFrame } from "@/components/closing-cta-frame";
import { LeadDialog } from "@/components/lead-dialog";
import { Button } from "@/components/ui/button";

export function ClosingCta({
  heading = "Ready to get started?",
  text = "Leave your number and we'll call you back, whether you're after a loan or a home.",
  ctaLabel = "Get a callback",
  origin = "closing-cta",
  id = "get-started",
  href,
}: {
  heading?: string;
  text?: string;
  ctaLabel?: string;
  origin?: string;
  id?: string;
  href?: string;
}) {
  return (
    <ClosingCtaFrame id={id} heading={heading} text={text}>
      {href ? (
        <Button asChild size="lg">
          <Link href={href}>
            {ctaLabel}
            <ArrowUpRight aria-hidden />
          </Link>
        </Button>
      ) : (
        <LeadDialog businessLine="loans" lineSelectable origin={origin} triggerLabel={ctaLabel} size="lg" />
      )}
    </ClosingCtaFrame>
  );
}
