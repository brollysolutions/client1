import type { ReactNode } from "react";
import Link from "next/link";

// Single source of truth for public-page FAQ copy (home, loans, real estate,
// earn-with-us). `a` is always plain text so every page can build FAQPage
// JSON-LD from the same array without the visible copy and the structured
// data drifting apart. `aRich`, when present, is what actually renders (e.g.
// an inline link); `a` still feeds the JSON-LD in that case.
export type FaqItem = { q: string; a: string; aRich?: ReactNode };

export function faqPageJsonLd(items: FaqItem[]) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export const HOME_FAQ_ITEMS: FaqItem[] = [
  {
    q: "Is the platform free to use?",
    a: "Yes. There's no charge to borrowers or buyers for using the platform, comparing offers, or getting matched with a partner.",
  },
  {
    q: "How do you verify partners and listings?",
    a: "Every lender, agent, and listing goes through a KYC check before it reaches you, so you're never dealing with someone unverified.",
  },
  {
    q: "Do you cover both loans and real estate?",
    a: "Yes. You can compare loan offers and browse verified homes in the same place, with the same team supporting you.",
  },
  {
    q: "What happens after I leave my number?",
    a: "One of our team calls you back to understand what you need and connect you with the right lender or agent.",
  },
  {
    q: "Will you sell my number to anyone?",
    a: "No. We never sell or share your number. It's only used to call you back about your own enquiry.",
  },
  {
    q: "How do I become an agent?",
    a: "Visit our Earn with Us page to see the requirements and apply. We verify your KYC, and once you're approved you can start earning commission.",
    aRich: (
      <>
        Visit our{" "}
        <Link
          href="/earn-with-us"
          className="font-medium text-[var(--nav-primary)] underline underline-offset-4"
        >
          Earn with Us
        </Link>{" "}
        page to see the requirements and apply. We verify your KYC, and once
        you&apos;re approved you can start earning commission.
      </>
    ),
  },
];

export const AGENT_FAQ_ITEMS: FaqItem[] = [
  {
    q: "Who can apply to become an agent?",
    a: "Anyone who can bring loan or real estate leads and pass our KYC check. No fixed prior experience is required.",
  },
  {
    q: "Can I be an agent for both loans and real estate?",
    a: "No, every agent account is tied to one line only. You pick loans or real estate when you apply.",
  },
  {
    q: "Do real estate agents need to be RERA registered?",
    a: "Yes, a valid RERA agent code is required as part of KYC for the real estate track.",
  },
  {
    q: "I am already a client. Can I convert to an agent?",
    a: "Yes, existing clients can apply to convert to an agent account through the same KYC process.",
  },
  {
    q: "How is my commission decided?",
    a: "There is no fixed slab. Commission is set for each deal individually once it closes, based on that specific loan or property.",
  },
  {
    q: "How and when do I get paid?",
    a: "Once a deal is approved, payout is made either through Razorpay or by cheque.",
  },
  {
    q: "Is there any cost to apply?",
    a: "No, applying is free. We only need your details and KYC documents to verify you.",
  },
  {
    q: "What happens after I apply?",
    a: "We review your KYC, and once you are verified, your agent account is activated so you can start referring clients.",
  },
  {
    q: "Do I need to become an agent to refer someone?",
    a: "No. Any registered user gets a referral code and can earn cashback. Agents are a separate program that earns commission on the deals they work.",
  },
  {
    q: "How does referral cashback work?",
    a: "Share your referral code. When a person you referred completes a property purchase or their loan is disbursed, you earn cashback, paid through Razorpay or by cheque.",
  },
];

export const LOAN_FAQ_ITEMS: FaqItem[] = [
  {
    q: "How do I know if I'm eligible?",
    a: "Each lender has its own criteria, usually based on your income, credit history, and the loan type. Leave your number and our team checks your profile against multiple lenders before suggesting one.",
  },
  {
    q: "What documents will I need?",
    a: "Typically PAN, Aadhaar, proof of income like salary slips or ITR, and recent bank statements. The exact list depends on the loan. Our team tells you upfront so there are no surprises.",
  },
  {
    q: "How long until the money reaches my account?",
    a: "It depends on the lender and loan type. Personal loans can disburse within a few days once approved. Property loans take longer because of valuation and legal checks. We stay with you until disbursal.",
  },
  {
    q: "Does the platform charge me anything?",
    a: "No. Comparing offers, getting matched, and the support from our team are all free for you. We earn from our lender partners, not from borrowers.",
  },
  {
    q: "Will comparing offers here affect my credit score?",
    a: "No. Enquiring with us does not touch your score. A credit check happens only when you actually apply with a lender, and we tell you before that step.",
  },
  {
    q: "Can I compare offers from more than one lender?",
    a: "Yes. That's the point. We put the options side by side so you can pick on rate, tenure, and processing fee instead of taking the first offer.",
  },
  {
    q: "Can I repay my loan early?",
    a: "Most lenders allow prepayment. Charges vary by lender and loan type, and floating rate loans often have none. We flag the prepayment terms before you sign so you know what early closure costs.",
  },
];

export const REAL_ESTATE_FAQ_ITEMS: FaqItem[] = [
  {
    q: "Are the listings really verified?",
    a: "Yes. Every listing and every agent goes through verification before it reaches you, including RERA checks where they apply. You never deal with an unverified party.",
  },
  {
    q: "How do site visits work?",
    a: "Once you enquire, our team calls to understand what you're looking for and schedules visits at times that suit you. A verified agent accompanies you on every visit.",
  },
  {
    q: "Do I pay for the property through the platform?",
    a: "No, never. Token, booking, and purchase payments go directly between you and the seller or builder. The only money that moves through us is referral cashback or agent payouts.",
  },
  {
    q: "How does the booking and token process work?",
    a: "Your agent walks you through it. Once you pick a property, the token and booking amounts are paid directly to the seller or builder, and we help you track the paperwork from there.",
  },
  {
    q: "Do you check the legal side of a property?",
    a: "We verify RERA registration and guide you through the title and document checks before you commit. For high value purchases we also recommend an independent legal review, and we help you arrange one.",
  },
  {
    q: "Can you also arrange the home loan?",
    a: "Yes. Our loans team works alongside your property purchase, so you can compare home loan offers and get the finance moving while the paperwork progresses.",
  },
  {
    q: "What happens after I leave my number?",
    a: "One of our team calls you back, understands your budget and preferences, and lines up matching verified properties. No spam, and your number is never sold or shared.",
  },
];
