import type { CalculatorDef, CalculatorSlug } from "./types";

// Single source of truth for all 11 calculators. Drives the hub, each route's
// metadata + JSON-LD, internal links, the FAQ accordions, and the lead CTA.
// Copy rules (apps/web/CLAUDE.md): rupee only, no em/en dashes, short humanized
// sentences.
export const CALCULATORS: CalculatorDef[] = [
  {
    slug: "emi",
    group: "loans",
    businessLine: "loans",
    eyebrow: "Loan calculators",
    navLabel: "EMI Calculator",
    cardSummary: "Work out the monthly EMI, total interest, and full repayment schedule for any loan.",
    h1: "EMI Calculator",
    title: "EMI Calculator: Home, Car & Personal Loan EMI",
    metaDescription:
      "Free EMI calculator for home, car and personal loans. See your monthly EMI, total interest, and month by month amortization schedule in seconds.",
    keywords: ["emi calculator", "home loan emi calculator", "car loan emi calculator", "personal loan emi calculator", "loan emi calculator"],
    intro:
      "Enter your loan amount, interest rate, and tenure to see the monthly EMI, the total interest you will pay, and a full repayment schedule. Works for home, car, and personal loans.",
    howItWorks:
      "EMI is calculated on a reducing balance: EMI = P x r x (1+r)^n / ((1+r)^n - 1), where P is the loan amount, r is the monthly interest rate (annual rate divided by 12), and n is the tenure in months. Early EMIs are mostly interest; the principal share grows over time.",
    faq: [
      { q: "How is home loan EMI calculated?", a: "EMI = P x r x (1+r)^n / ((1+r)^n - 1), where P is the principal, r the monthly interest rate, and n the tenure in months. Our calculator applies this on a reducing balance and rounds each installment to the nearest rupee." },
      { q: "Does a longer tenure reduce my EMI?", a: "Yes, a longer tenure lowers the monthly EMI but raises the total interest you pay over the life of the loan. Use the schedule to compare tenures." },
      { q: "Is this the same EMI my bank will charge?", a: "It is very close. Your bank may add processing fees, insurance, and GST on charges, and may round differently, so treat this as an accurate estimate." },
    ],
    relatedSlugs: ["loan-eligibility", "prepayment", "loan-comparison", "loan-against-property"],
    leadOrigin: "calculator-emi",
    leadCta: {
      heading: "Ready to apply for this loan?",
      text: "Leave your number and our loans team will call you back to match you with the right lender.",
      triggerLabel: "Check if you qualify",
      submitLabel: "Request callback",
    },
  },
  {
    slug: "loan-eligibility",
    group: "loans",
    businessLine: "loans",
    eyebrow: "Loan calculators",
    navLabel: "Loan Eligibility",
    cardSummary: "Find out how much loan you can get from your income, obligations, and tenure.",
    h1: "Loan Eligibility Calculator",
    title: "Loan Eligibility Calculator: How Much Loan Can I Get",
    metaDescription:
      "Check how much loan you are eligible for based on your income, existing EMIs, rate, and tenure. Uses the FOIR and income multiplier method Indian banks apply.",
    keywords: ["loan eligibility calculator", "home loan eligibility calculator", "how much loan can i get", "foir calculator"],
    intro:
      "See the loan amount a lender is likely to sanction from your monthly income, existing EMIs, interest rate, and tenure. We use the same FOIR and income multiplier rules Indian banks apply.",
    howItWorks:
      "Banks cap your total EMIs at a share of income (FOIR, usually around 50 percent). Max EMI = income x FOIR minus your existing EMIs. That EMI is converted to a maximum loan, and the bank sanctions the lower of that and a flat multiple of your monthly income.",
    faq: [
      { q: "What is FOIR?", a: "FOIR is the Fixed Obligation to Income Ratio, the share of your monthly income that can go toward all EMIs. Most lenders keep it around 40 to 55 percent." },
      { q: "Why is eligibility lower than I expected?", a: "Existing EMIs reduce how much new EMI you can take on, and lenders also cap the loan at a multiple of income. The lower of the two limits applies." },
      { q: "Can I increase my eligibility?", a: "A longer tenure, a co-applicant's income, or closing a small existing loan can all raise your eligible amount." },
    ],
    relatedSlugs: ["emi", "home-affordability", "loan-against-property", "prepayment"],
    leadOrigin: "calculator-loan-eligibility",
    leadCta: {
      heading: "Want an exact eligibility check?",
      text: "Leave your number and an advisor will call you back to confirm what you qualify for.",
      triggerLabel: "Get matched with lenders",
      submitLabel: "Request callback",
    },
  },
  {
    slug: "prepayment",
    group: "loans",
    businessLine: "loans",
    eyebrow: "Loan calculators",
    navLabel: "Prepayment",
    cardSummary: "See how a part-payment cuts your tenure or your EMI, and how much interest you save.",
    h1: "Loan Prepayment Calculator",
    title: "Loan Prepayment Calculator: Interest Saved on Part-Payment",
    metaDescription:
      "See how a lump sum part-payment on your loan reduces the tenure or the EMI, and exactly how much interest you save. Compare both options side by side.",
    keywords: ["prepayment calculator", "part payment calculator", "home loan prepayment calculator", "loan foreclosure calculator"],
    intro:
      "Enter your loan and a lump sum to see the impact of a part-payment. Compare keeping the EMI and shortening the loan against keeping the tenure and lowering the EMI, with the interest saved for each.",
    howItWorks:
      "A part-payment goes straight to the outstanding principal. You can keep the same EMI and finish the loan sooner, or keep the same tenure and pay a smaller EMI. Reducing the tenure almost always saves more interest.",
    faq: [
      { q: "Should I reduce tenure or EMI?", a: "Reducing the tenure usually saves more interest because the balance is cleared faster. Reducing the EMI eases monthly cash flow instead. The calculator shows both." },
      { q: "When is prepayment most effective?", a: "Early in the loan, when the outstanding balance and the interest share of each EMI are highest." },
      { q: "Are there prepayment charges?", a: "Floating-rate home loans to individuals usually have no prepayment penalty in India, but check your loan agreement for fixed-rate or other loan types." },
    ],
    relatedSlugs: ["emi", "loan-eligibility", "loan-comparison", "loan-against-property"],
    leadOrigin: "calculator-prepayment",
    leadCta: {
      heading: "Thinking about prepaying?",
      text: "Leave your number and an advisor will call you back to talk through your options.",
      triggerLabel: "Talk to an advisor",
      submitLabel: "Request callback",
    },
  },
  {
    slug: "loan-comparison",
    group: "loans",
    businessLine: "loans",
    eyebrow: "Loan calculators",
    navLabel: "Loan Comparison",
    cardSummary: "Compare up to three loan offers side by side on EMI, total interest, and cost.",
    h1: "Loan Comparison Calculator",
    title: "Loan Comparison Calculator: Compare Loan Offers",
    metaDescription:
      "Compare up to three loan offers side by side. See the EMI, total interest, and all in cost for each, with the cheapest option highlighted.",
    keywords: ["loan comparison calculator", "compare loan offers", "compare home loan emi", "which loan is cheaper"],
    intro:
      "Enter two or three loan offers to compare them side by side. See the EMI, total interest, and total cost for each so you can pick the genuinely cheaper option, not just the lowest rate.",
    howItWorks:
      "Each offer is run through the same reducing balance EMI formula, then processing fees are added to show the true cost. The lowest advertised rate is not always the cheapest once fees and tenure are counted.",
    faq: [
      { q: "Why compare total cost and not just the rate?", a: "A lower rate with a high processing fee or a longer tenure can cost more overall. Comparing total interest and all in cost shows the real picture." },
      { q: "How many offers can I compare?", a: "Up to three at a time, which covers most real decisions between banks or lenders." },
      { q: "Do you show real bank offers?", a: "You enter the offers yourself. The rates you were quoted stay private and are only used for this comparison." },
    ],
    relatedSlugs: ["emi", "loan-eligibility", "prepayment", "loan-against-property"],
    leadOrigin: "calculator-loan-comparison",
    leadCta: {
      heading: "Found the right offer?",
      text: "Leave your number and we will call you back to help you apply.",
      triggerLabel: "Get an exact quote",
      submitLabel: "Request callback",
    },
  },
  {
    slug: "loan-against-property",
    group: "loans",
    businessLine: "loans",
    eyebrow: "Loan calculators",
    navLabel: "Loan Against Property",
    cardSummary: "See how much you can borrow against a property you own, and the EMI on it.",
    h1: "Loan Against Property Calculator",
    title: "Loan Against Property (LAP) Calculator",
    metaDescription:
      "Calculate how much you can borrow against a property you own and the EMI on a loan against property. Based on the property value, LTV, rate, and tenure.",
    keywords: ["loan against property calculator", "lap calculator", "lap emi calculator", "mortgage loan calculator"],
    intro:
      "Enter your property's market value to see the loan you can raise against it and the EMI. Loan against property typically funds 50 to 70 percent of the value at a lower rate than an unsecured loan.",
    howItWorks:
      "The maximum loan is the loan to value ratio times the property's market value. That amount, at your rate and tenure, gives the EMI on a reducing balance, the same as any other loan.",
    faq: [
      { q: "How much can I borrow against my property?", a: "Usually 50 to 70 percent of the market value, depending on the lender, the property type, and your income and repayment capacity." },
      { q: "Is LAP cheaper than a personal loan?", a: "Yes, because it is secured against your property the interest rate is generally lower than an unsecured personal loan, though still above a home loan." },
      { q: "Can I use LAP funds for anything?", a: "Typically yes, for business, education, or other needs, subject to the lender's terms." },
    ],
    relatedSlugs: ["emi", "loan-eligibility", "prepayment", "home-affordability"],
    leadOrigin: "calculator-loan-against-property",
    leadCta: {
      heading: "Want to unlock your property's value?",
      text: "Leave your number and an advisor will call you back with your options.",
      triggerLabel: "Check my eligibility",
      submitLabel: "Request callback",
    },
  },
  {
    slug: "home-affordability",
    group: "real_estate",
    businessLine: "real_estate",
    eyebrow: "Property calculators",
    navLabel: "Home Affordability",
    cardSummary: "Find the property price you can afford from your income and down payment.",
    h1: "Home Affordability Calculator",
    title: "Home Affordability Calculator: How Much House Can I Afford",
    metaDescription:
      "Find out how much house you can afford from your income, existing EMIs, and down payment. See the property price, loan, and EMI you can comfortably manage.",
    keywords: ["home affordability calculator", "how much house can i afford", "property affordability calculator", "home budget calculator"],
    intro:
      "Enter your income, existing EMIs, and the down payment you can make to see the property price you can comfortably afford, along with the loan and monthly EMI behind it.",
    howItWorks:
      "Your income sets the EMI you can afford (via FOIR), which converts to a maximum loan. Add your down payment for the property price, capped by how much the lender will lend against the value (the LTV limit).",
    faq: [
      { q: "How much house can I afford on my salary?", a: "As a rule of thumb, keep all EMIs within about half your net monthly income. The calculator turns that into a loan and, with your down payment, a property price." },
      { q: "Should I use CTC or take home pay?", a: "Use net take home pay, not CTC. Lenders assess affordability on what actually reaches your account each month." },
      { q: "Does the down payment change what I can afford?", a: "Yes. A larger down payment raises the property price you can reach and reduces the loan and EMI." },
    ],
    relatedSlugs: ["emi", "loan-eligibility", "stamp-duty", "down-payment-planner"],
    leadOrigin: "calculator-home-affordability",
    leadCta: {
      heading: "Ready to find a home in budget?",
      text: "Leave your number and our real estate team will call you back with matching options.",
      triggerLabel: "See homes in my budget",
      submitLabel: "Request callback",
    },
  },
  {
    slug: "stamp-duty",
    group: "real_estate",
    businessLine: "real_estate",
    eyebrow: "Property calculators",
    navLabel: "Stamp Duty",
    cardSummary: "Estimate stamp duty and registration charges for your state on a property purchase.",
    h1: "Stamp Duty & Registration Calculator",
    title: "Stamp Duty Calculator: State-wise Registration Charges",
    metaDescription:
      "Estimate stamp duty and registration charges on a property purchase, state by state. Includes women buyer concessions where applicable.",
    keywords: ["stamp duty calculator", "registration charges calculator", "property registration cost", "stamp duty and registration"],
    intro:
      "Pick your state and enter the property value to estimate the stamp duty and registration charges you will pay. Rates vary by state, and many states offer a concession for women buyers.",
    howItWorks:
      "Stamp duty is a percentage of the property value set by each state, usually 4 to 7 percent. Registration is typically about 1 percent. These are paid on top of the price and cannot be financed by a home loan.",
    faq: [
      { q: "How much is stamp duty in my state?", a: "It varies. Most states charge 4 to 7 percent stamp duty plus about 1 percent registration. Select your state above for an estimate." },
      { q: "Do women pay less stamp duty?", a: "In several states women buyers get a 1 to 2 percent concession on stamp duty. The calculator applies it where it exists." },
      { q: "Can stamp duty be added to my home loan?", a: "Usually no. Stamp duty and registration are upfront costs the buyer pays separately from the loan." },
    ],
    relatedSlugs: ["home-affordability", "gst", "down-payment-planner", "emi"],
    leadOrigin: "calculator-stamp-duty",
    leadCta: {
      heading: "Planning a property purchase?",
      text: "Leave your number and our real estate team will call you back to guide you.",
      triggerLabel: "Talk to our team",
      submitLabel: "Request callback",
    },
  },
  {
    slug: "gst",
    group: "real_estate",
    businessLine: "real_estate",
    eyebrow: "Property calculators",
    navLabel: "GST on Property",
    cardSummary: "Work out the GST on an under-construction property purchase.",
    h1: "GST on Property Calculator",
    title: "GST on Property Calculator: Under-Construction Flats",
    metaDescription:
      "Calculate GST on an under-construction property. 1 percent for affordable homes, 5 percent otherwise, charged on two-thirds of the value. Ready homes are exempt.",
    keywords: ["gst on property calculator", "gst on flat purchase", "gst on under construction property", "gst on real estate"],
    intro:
      "Enter the property value and type to see the GST payable. Under-construction homes attract GST, while ready to move properties with a completion certificate are exempt.",
    howItWorks:
      "GST is 1 percent for affordable homes and 5 percent otherwise, both without input tax credit. It applies to two-thirds of the price, because one-third is treated as the land value and is not taxed. Ready to move homes pay no GST.",
    faq: [
      { q: "Is there GST on a ready to move flat?", a: "No. Once a completion certificate is issued, there is no GST on the sale. GST applies only to under-construction property." },
      { q: "What counts as an affordable home?", a: "Broadly, a home up to 60 square metres carpet area in metros or 90 square metres elsewhere, and priced up to 45 lakh. It attracts 1 percent GST." },
      { q: "Why is GST on two-thirds of the value?", a: "One-third of the price is treated as the value of the land, which is not subject to GST, so tax applies to the remaining two-thirds." },
    ],
    relatedSlugs: ["stamp-duty", "home-affordability", "down-payment-planner", "property-appreciation"],
    leadOrigin: "calculator-gst",
    leadCta: {
      heading: "Buying an under-construction home?",
      text: "Leave your number and our real estate team will call you back to help.",
      triggerLabel: "Talk to our team",
      submitLabel: "Request callback",
    },
  },
  {
    slug: "property-appreciation",
    group: "real_estate",
    businessLine: "real_estate",
    eyebrow: "Property calculators",
    navLabel: "Property Appreciation",
    cardSummary: "Project the future value of a property and its annual growth rate.",
    h1: "Property Appreciation Calculator",
    title: "Property Appreciation Calculator: Future Value & CAGR",
    metaDescription:
      "Project the future value of a property from an expected growth rate, or work out the CAGR between two values. See the total gain over your holding period.",
    keywords: ["property appreciation calculator", "property future value calculator", "real estate cagr calculator", "property growth calculator"],
    intro:
      "Enter a property value, an expected annual growth rate, and a holding period to project the future value and total gain. You can also derive the annual growth rate (CAGR) between two values.",
    howItWorks:
      "Future value grows by compounding: FV = PV x (1 + g)^n, where g is the annual growth rate and n is the number of years. CAGR reverses this to find the annual rate between a start and end value.",
    faq: [
      { q: "What is a realistic appreciation rate?", a: "Indian residential property has historically grown around 6 to 9 percent a year on average, though this varies widely by city and location." },
      { q: "What is CAGR?", a: "CAGR is the compound annual growth rate, the steady yearly rate that takes a value from its start to its end amount over the period." },
      { q: "Does this account for costs and tax?", a: "No, it shows gross appreciation. Buying costs, maintenance, and capital gains tax reduce the real return." },
    ],
    relatedSlugs: ["rental-yield", "home-affordability", "gst", "stamp-duty"],
    leadOrigin: "calculator-property-appreciation",
    leadCta: {
      heading: "Investing in property?",
      text: "Leave your number and our real estate team will call you back with opportunities.",
      triggerLabel: "Explore properties",
      submitLabel: "Request callback",
    },
  },
  {
    slug: "rental-yield",
    group: "real_estate",
    businessLine: "real_estate",
    eyebrow: "Property calculators",
    navLabel: "Rental Yield",
    cardSummary: "Calculate the gross and net rental yield on a property investment.",
    h1: "Rental Yield Calculator",
    title: "Rental Yield Calculator: Gross & Net Yield",
    metaDescription:
      "Calculate the gross and net rental yield on a property from the rent, value, and expenses. See whether a property is a strong rental investment.",
    keywords: ["rental yield calculator", "gross rental yield", "net rental yield", "property rental return calculator"],
    intro:
      "Enter the property value, the monthly rent, and annual expenses to see the gross and net rental yield. Yield tells you the annual rental return as a percentage of the property's value.",
    howItWorks:
      "Gross yield is annual rent divided by property value, as a percentage. Net yield subtracts annual costs like maintenance, tax, and vacancy first, giving a truer picture of the return.",
    faq: [
      { q: "What is a good rental yield in India?", a: "Residential yields of 3.5 to 5 percent are common, and above 4 percent net is generally considered healthy. Commercial property often yields more." },
      { q: "What is the difference between gross and net yield?", a: "Gross yield ignores costs. Net yield subtracts maintenance, property tax, insurance, and a vacancy allowance, so it reflects what you actually keep." },
      { q: "Should I include vacancy in expenses?", a: "Yes, a realistic estimate sets aside around one month of rent a year for vacancy and adds it to expenses." },
    ],
    relatedSlugs: ["property-appreciation", "home-affordability", "emi", "loan-against-property"],
    leadOrigin: "calculator-rental-yield",
    leadCta: {
      heading: "Looking for a rental investment?",
      text: "Leave your number and our real estate team will call you back with options.",
      triggerLabel: "See investment properties",
      submitLabel: "Request callback",
    },
  },
  {
    slug: "down-payment-planner",
    group: "real_estate",
    businessLine: "real_estate",
    eyebrow: "Property calculators",
    navLabel: "Down Payment Planner",
    cardSummary: "Plan the monthly saving needed to reach your property down payment.",
    h1: "Down Payment Planner",
    title: "Down Payment Planner: Save for Your Home",
    metaDescription:
      "Plan how much to save each month to reach your property down payment by your target date, allowing for returns on your savings.",
    keywords: ["down payment calculator", "down payment planner", "save for home down payment", "home down payment savings"],
    intro:
      "Enter the property value, the down payment share, your timeline, and an expected return on savings to see how much you need to set aside each month to reach your goal.",
    howItWorks:
      "The required down payment is the property value minus the loan (bounded by the LTV limit). To reach it by your target date, the monthly saving is derived from a SIP formula that allows for growth on what you invest.",
    faq: [
      { q: "How much down payment do I need?", a: "Lenders finance 75 to 90 percent of the value, so plan for a down payment of 10 to 25 percent, plus stamp duty and registration on top." },
      { q: "Where should I keep the down payment savings?", a: "For a short horizon, lower risk options are safer. The planner lets you set an expected return to reflect your choice." },
      { q: "Do I need to save for more than the down payment?", a: "Yes. Budget for stamp duty, registration, and any GST as well, since these are paid separately from the loan." },
    ],
    relatedSlugs: ["home-affordability", "stamp-duty", "gst", "emi"],
    leadOrigin: "calculator-down-payment-planner",
    leadCta: {
      heading: "Saving for a home?",
      text: "Leave your number and our real estate team will call you back to help you plan.",
      triggerLabel: "Talk to our team",
      submitLabel: "Request callback",
    },
  },
];

export const CALCULATOR_SLUGS: CalculatorSlug[] = CALCULATORS.map((c) => c.slug);

const BY_SLUG = new Map(CALCULATORS.map((c) => [c.slug, c]));

export function getCalculator(slug: string): CalculatorDef | undefined {
  return BY_SLUG.get(slug as CalculatorSlug);
}
