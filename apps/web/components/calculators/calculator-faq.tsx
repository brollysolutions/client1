"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { CalculatorFaq as Faq } from "@/lib/calculators/types";

// Visible FAQ. Shares its content with the FAQPage JSON-LD (both read the same
// registry `faq` array), so the page and the structured data never drift.
export function CalculatorFaq({ items }: { items: Faq[] }) {
  return (
    <Accordion type="single" collapsible className="w-full">
      {items.map((item, index) => (
        <AccordionItem key={item.q} value={`faq-${index}`}>
          <AccordionTrigger className="text-left font-heading text-base text-[var(--nav-text)]">
            {item.q}
          </AccordionTrigger>
          <AccordionContent className="text-base text-text-secondary">
            {item.a}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
