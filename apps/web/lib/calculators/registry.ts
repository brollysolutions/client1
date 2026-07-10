import type { CalculatorDef, CalculatorFaq, CalculatorSlug } from "./types";

// Single source of truth for all 11 calculators. Drives the hub, each route's
// metadata + JSON-LD, internal links, the FAQ accordions, and the lead CTA.
// Copy rules (apps/web/CLAUDE.md): rupee only, no em/en dashes, short humanized
// sentences. SEO copy (title/meta/intro/howItWorks/faq) is written to India
// search intent, keyword research in scratchpad/keyword-research.md.
const ART = "/illustrations/calculators";

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
      "Free EMI calculator for home, car and personal loans. See your monthly EMI, total interest, and a month by month repayment schedule in seconds.",
    keywords: ["emi calculator", "home loan emi calculator", "car loan emi calculator", "personal loan emi calculator", "loan emi calculator"],
    intro:
      "Use this EMI calculator to find your monthly EMI on any home, car, or personal loan. Enter the loan amount, interest rate, and tenure to see the EMI, the total interest you will pay, and a full month by month repayment schedule.",
    howItWorks:
      "EMI is calculated on a reducing balance with the formula EMI = P x r x (1+r)^n / ((1+r)^n - 1), where P is the loan amount, r is the monthly interest rate (the annual rate divided by 12), and n is the tenure in months. For example, a 30 lakh loan at 9 percent for 20 years works out to an EMI of about 26,992. Early EMIs are mostly interest and the principal share grows over time, which is why the schedule below shows the split changing every month.",
    heroArt: `${ART}/emi.svg`,
    faq: [
      { q: "How is home loan EMI calculated?", a: "EMI = P x r x (1+r)^n / ((1+r)^n - 1), where P is the principal, r the monthly interest rate, and n the tenure in months. Our calculator applies this on a reducing balance and rounds each installment to the nearest rupee." },
      { q: "How does this EMI calculator work?", a: "Enter your loan amount, annual interest rate, and tenure. The calculator runs the reducing balance EMI formula and instantly shows your monthly EMI, the total interest, the total payment, and a full amortization schedule you can export." },
      { q: "Does EMI include interest?", a: "Yes. Each EMI has two parts, interest on the outstanding balance and repayment of principal. In the early months most of the EMI is interest, and the principal portion rises as the balance falls." },
      { q: "Is EMI calculated on the sanctioned or disbursed amount?", a: "On the amount actually disbursed. For a ready property the full loan is usually disbursed at once, while for an under construction home the bank disburses in stages and may charge pre EMI interest until full disbursal." },
      { q: "Does a longer tenure reduce my EMI?", a: "Yes, a longer tenure lowers the monthly EMI but raises the total interest you pay over the life of the loan. Use the schedule to compare a few tenures before you decide." },
      { q: "Is this the same EMI my bank will charge?", a: "It is very close. Your bank may add processing fees, insurance, and GST on charges, and may round differently, so treat this as an accurate estimate rather than the exact figure on your sanction letter." },
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
      "Check how much home loan you are eligible for from your income, existing EMIs, rate, and tenure. Uses the FOIR and income multiplier method Indian banks apply.",
    keywords: ["loan eligibility calculator", "home loan eligibility calculator", "how much loan can i get", "foir calculator"],
    intro:
      "Use this loan eligibility calculator to see how much loan you can get from your monthly income, existing EMIs, interest rate, and tenure. It applies the same FOIR and income multiplier rules Indian banks use to decide your home loan eligibility.",
    howItWorks:
      "Banks cap your total EMIs at a share of income called FOIR (Fixed Obligation to Income Ratio), usually around 50 percent. Your maximum EMI is income times FOIR minus your existing EMIs. That EMI is converted back into a loan amount at your rate and tenure, and the bank sanctions the lower of that figure and a flat multiple of your monthly income. A longer tenure and a co-applicant both push the eligible amount up.",
    heroArt: `${ART}/loan-eligibility.svg`,
    faq: [
      { q: "How is home loan eligibility calculated?", a: "Lenders work out the maximum EMI you can afford as your income times FOIR (around 50 percent) minus your current EMIs, then convert that EMI into a loan at your rate and tenure. The final sanction is the lower of that amount and a multiple of your monthly income." },
      { q: "What is FOIR?", a: "FOIR is the Fixed Obligation to Income Ratio, the share of your monthly income that can go toward all EMIs put together. Most lenders keep it between 40 and 55 percent depending on your income band." },
      { q: "Does a personal loan affect my home loan eligibility?", a: "Yes. Every running EMI, including a personal loan, car loan, or credit card EMI, reduces the new EMI you can take on, which lowers your eligible loan amount. Closing a small loan before you apply can raise eligibility." },
      { q: "Does my CIBIL score affect eligibility?", a: "Indirectly but strongly. A higher CIBIL score improves your chances of approval and can get you a lower interest rate, and a lower rate means a larger loan for the same EMI. Most lenders look for a score above 750." },
      { q: "Can rental or a co-applicant's income increase eligibility?", a: "Yes. Adding a co-applicant's income, or a share of documented rental income, raises the total income the lender considers and can noticeably increase the amount you qualify for." },
      { q: "Why is my eligibility lower than I expected?", a: "Usually because existing EMIs eat into your affordable EMI, or because the loan is capped at a multiple of income. The lower of the two limits always applies, so both your obligations and your income band matter." },
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
    title: "Loan Prepayment Calculator: Interest Saved",
    metaDescription:
      "See how a lump sum prepayment on your home loan cuts the tenure or the EMI, and exactly how much interest you save. Compare both options side by side.",
    keywords: ["prepayment calculator", "part payment calculator", "home loan prepayment calculator", "loan foreclosure calculator"],
    intro:
      "Use this loan prepayment calculator to see how a lump sum part-payment on your home loan reduces the tenure or the EMI, and how much interest you save. Compare keeping the EMI and finishing sooner against keeping the tenure and paying a lower EMI.",
    howItWorks:
      "A prepayment goes straight to your outstanding principal, so the interest on every future month is charged on a smaller balance. You then choose between two outcomes. Keep the same EMI and the loan ends sooner, or keep the same tenure and pay a smaller EMI. Reducing the tenure almost always saves more interest, because the balance clears faster. A prepayment made early in the loan, when the balance is highest, saves the most.",
    heroArt: `${ART}/prepayment.svg`,
    faq: [
      { q: "Should I reduce the tenure or the EMI when I prepay?", a: "Reducing the tenure usually saves more interest, because the outstanding balance is cleared faster. Reducing the EMI eases your monthly cash flow instead. The calculator shows the interest saved for both so you can choose." },
      { q: "Does prepayment reduce the principal or the interest?", a: "It reduces the principal directly. Because future interest is charged on that lower balance, cutting the principal is what actually saves you interest over the rest of the loan." },
      { q: "Are there prepayment charges on a home loan?", a: "For floating-rate home loans to individuals, the RBI does not allow prepayment or foreclosure penalties. Fixed-rate loans, and some other loan types, can carry a charge, so check your loan agreement." },
      { q: "When is prepayment most effective?", a: "Early in the loan, when the outstanding balance and the interest share of each EMI are at their highest. The same lump sum saves far more interest in year two than in year twelve." },
      { q: "Does prepaying a home loan affect my CIBIL score?", a: "Prepaying or foreclosing a loan does not hurt your CIBIL score. Closing a loan cleanly is recorded positively, though your score may dip briefly simply because your active credit mix changes." },
      { q: "How many times can I prepay in a year?", a: "Most lenders allow unlimited part-payments on floating-rate home loans, though a few set a minimum amount or a cap per year. Check your lender's terms, as the calculator assumes a single lump sum." },
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
      "Compare up to three loan offers side by side to find which loan is cheaper. See the EMI, total interest, and all in cost for each, with the best highlighted.",
    keywords: ["loan comparison calculator", "compare loan offers", "which loan is cheaper", "compare home loan emi"],
    intro:
      "Use this loan comparison calculator to compare up to three loan offers side by side and find which loan is genuinely cheaper. See the EMI, total interest, and total cost for each, so you can look past the advertised rate and pick the offer that actually costs less.",
    howItWorks:
      "Each offer is run through the same reducing balance EMI formula, then the processing fee is added to show the true all in cost. A lower advertised rate is not always the cheaper loan once the fee and the tenure are counted, which is why the calculator ranks offers by total cost, not by headline rate.",
    heroArt: `${ART}/loan-comparison.svg`,
    faq: [
      { q: "How do I know which loan is cheaper?", a: "Compare the total cost, not just the interest rate. A loan with a slightly higher rate but a lower processing fee, or a shorter tenure, can cost less overall. The calculator adds fees to interest so the cheapest offer is clear." },
      { q: "Why compare total cost instead of the interest rate?", a: "A low rate paired with a high processing fee or a long tenure can end up more expensive. Total interest plus fees shows what you actually pay over the life of the loan, which is the number that matters." },
      { q: "Why is a home loan cheaper than a personal loan?", a: "A home loan is secured against the property, so the lender takes less risk and charges a lower rate. A personal loan is unsecured, which is why its rate, and its total cost, are usually much higher." },
      { q: "How many loan offers can I compare?", a: "Up to three at a time, which covers most real decisions between banks or lenders without cluttering the comparison." },
      { q: "Do you show real bank offers?", a: "No, you enter the offers yourself. The rates you were quoted stay private and are used only for this side by side comparison on your device." },
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
      "Calculate how much loan you can get against a property you own and the EMI on a loan against property, based on the property value, LTV, rate, and tenure.",
    keywords: ["loan against property calculator", "lap calculator", "lap emi calculator", "mortgage loan calculator"],
    intro:
      "Use this loan against property calculator to see how much you can borrow against a property you own and the EMI on it. A loan against property (LAP) typically funds 50 to 70 percent of the market value at a lower rate than an unsecured loan.",
    howItWorks:
      "The maximum loan is the loan to value ratio times your property's market value. For example, a 1 crore property at a 60 percent LTV supports a loan of up to 60 lakh. That amount, at your interest rate and tenure, gives the EMI on a reducing balance, exactly as any other loan. Lenders also check your income, so your final sanction is the lower of the LTV limit and your repayment capacity.",
    heroArt: `${ART}/loan-against-property.svg`,
    faq: [
      { q: "How much loan can I get against my property?", a: "Usually 50 to 70 percent of the market value, depending on the lender, the property type, and your income and repayment capacity. Enter your property value above to see the amount and the EMI." },
      { q: "Is a loan against property a secured loan?", a: "Yes. It is secured by mortgaging a property you own, which is why the lender charges a lower rate than an unsecured personal loan. The property stays yours and you continue to use it while you repay." },
      { q: "Is LAP cheaper than a personal loan?", a: "Yes. Because it is secured against your property the interest rate is generally lower than an unsecured personal loan, though still a little above a pure home loan." },
      { q: "Can I get a loan against property with a low CIBIL score?", a: "It is possible because the property is collateral, but a low score usually means a lower sanctioned amount or a higher interest rate. A score above 750 gets you the best terms." },
      { q: "Can I use the funds for anything?", a: "Typically yes, for business needs, education, a wedding, or medical expenses, subject to the lender's end use rules. LAP funds cannot be used for speculative or prohibited purposes." },
      { q: "What happens if I cannot repay a loan against property?", a: "As the loan is secured, prolonged default gives the lender the right to take possession of the mortgaged property and sell it to recover the dues under the SARFAESI Act. Talk to your lender early if you expect trouble repaying." },
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
    title: "Home Affordability Calculator: House You Can Afford",
    metaDescription:
      "Find out how much house you can afford in India from your income, existing EMIs, and down payment. See the property price, loan, and EMI you can comfortably manage.",
    keywords: ["home affordability calculator", "how much house can i afford", "how much home loan can i afford", "property affordability calculator"],
    intro:
      "Use this home affordability calculator to find out how much house you can afford in India. Enter your income, existing EMIs, and the down payment you can make to see the property price you can comfortably manage, along with the loan and monthly EMI behind it.",
    howItWorks:
      "Your income sets the EMI you can afford through the FOIR rule, and that EMI converts into a maximum loan at current rates. Add the down payment you have saved to get the property price you can reach, capped by how much the lender will finance against the value (the LTV limit). As a rule of thumb, keep all your EMIs within about half of your net take home pay so the home stays comfortable, not stretched.",
    heroArt: `${ART}/home-affordability.svg`,
    faq: [
      { q: "How much house can I afford on my salary?", a: "As a rule of thumb, keep all your EMIs within about half of your net monthly income. The calculator turns that affordable EMI into a loan and, with your down payment, into a property price you can comfortably manage." },
      { q: "How much home loan can I afford?", a: "The loan you can afford depends on your income minus existing EMIs, at current interest rates and tenure. Enter your figures above to see the maximum loan, then add your down payment for the full property budget." },
      { q: "Should I use CTC or take home pay?", a: "Use your net take home pay, not your CTC. Lenders assess affordability on what actually reaches your account each month after tax and deductions, and so should you." },
      { q: "Does the down payment change what I can afford?", a: "Yes. A larger down payment raises the property price you can reach and reduces the loan and the EMI. Most buyers plan a down payment of 10 to 25 percent plus stamp duty and registration." },
      { q: "What other costs should I budget beyond the price?", a: "Stamp duty and registration (often 5 to 8 percent of the value), GST on under construction homes, and one time charges like brokerage and interiors. These are paid separately from the loan, so keep cash aside for them." },
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
    title: "Stamp Duty Calculator: State-wise Charges",
    metaDescription:
      "Estimate stamp duty and registration charges on a property purchase, state by state in India. Includes women buyer concessions where applicable.",
    keywords: ["stamp duty calculator", "registration charges calculator", "property registration cost", "stamp duty and registration"],
    intro:
      "Use this stamp duty calculator to estimate the stamp duty and registration charges you will pay on a property purchase in your state. Rates vary from state to state, and many states offer a lower rate for women buyers, which the calculator applies where it exists.",
    howItWorks:
      "Stamp duty is a percentage of the property value set by each state government, usually 4 to 7 percent, and registration is typically about 1 percent. Both are charged on the higher of the agreement value and the state's ready reckoner or circle rate. These are upfront costs paid on top of the price, and they cannot be added to your home loan.",
    heroArt: `${ART}/stamp-duty.svg`,
    faq: [
      { q: "How much is stamp duty in my state?", a: "It varies by state. Most states charge 4 to 7 percent stamp duty plus about 1 percent registration. Select your state above to see an estimate for your property value." },
      { q: "Do women pay less stamp duty?", a: "In several states, including Delhi, Haryana, and others, women buyers get a concession of 1 to 2 percent on stamp duty. The calculator applies the lower rate where the state offers it." },
      { q: "Can stamp duty be added to my home loan?", a: "Usually no. Stamp duty and registration are upfront costs the buyer pays from their own funds, separate from the loan, so budget for them in cash alongside the down payment." },
      { q: "Is stamp duty refundable if the deal falls through?", a: "Some states allow a partial refund of stamp duty if the sale is cancelled and the deed is not registered, within a set time window and minus a deduction. The process and eligibility depend on your state's rules." },
      { q: "Is stamp duty tax deductible?", a: "Yes. Stamp duty and registration charges on a home can be claimed under Section 80C, within the overall 1.5 lakh limit, in the financial year they are paid. Check the current rules or a tax advisor for your case." },
      { q: "Is stamp duty calculated on the circle rate or the agreement value?", a: "On whichever is higher. If your agreement value is below the state's circle or ready reckoner rate, stamp duty is charged on the circle rate instead." },
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
    title: "GST on Property Calculator: Under-Construction",
    metaDescription:
      "Calculate GST on an under-construction property in India. 1 percent for affordable homes, 5 percent otherwise, on two-thirds of the value. Ready homes are exempt.",
    keywords: ["gst on property calculator", "gst on flat purchase", "gst on under construction property", "gst on real estate"],
    intro:
      "Use this GST on property calculator to work out the GST payable on an under-construction flat. Enter the property value and type to see the tax. Under-construction homes attract GST, while ready to move properties with a completion certificate are exempt.",
    howItWorks:
      "GST on residential property is an effective 1 percent for affordable homes and 5 percent otherwise, both without input tax credit. These headline rates already account for a one-third deduction for the value of the land, so you apply 1 percent or 5 percent to the full sale value shown on the cost sheet, not to two-thirds of it. For example, a 60 lakh non affordable flat carries 5 percent GST, which is 3 lakh. A completed, ready to move home with a completion certificate attracts no GST at all.",
    heroArt: `${ART}/gst.svg`,
    faq: [
      { q: "How much is GST on a property purchase?", a: "For an under-construction home, GST is an effective 1 percent for affordable housing and 5 percent for other homes, charged on the full sale value. A 60 lakh non affordable flat therefore carries 3 lakh of GST, and a 60 lakh affordable home carries 60,000." },
      { q: "Is there GST on a ready to move flat?", a: "No. Once a completion certificate is issued, the sale is treated as a completed property and there is no GST. GST applies only while the home is under construction." },
      { q: "What counts as an affordable home for the 1 percent rate?", a: "Broadly, a home of up to 60 square metres carpet area in metro cities or 90 square metres elsewhere, priced up to 45 lakh. Such homes attract the concessional 1 percent GST." },
      { q: "Is GST charged on the full price or only two-thirds?", a: "In law one-third of the price is treated as land and is not taxed, but the government folded that abatement into the low 1 percent and 5 percent rates. So on your cost sheet the rate is applied to the full price, and you do not deduct one-third again." },
      { q: "Is there GST on the resale of a property?", a: "No. GST applies to the first sale of an under-construction unit by a developer. The resale of a home between individuals is not subject to GST, though stamp duty still applies." },
      { q: "Can I claim input tax credit on the GST I pay?", a: "No. Under the current 1 percent and 5 percent scheme for residential property, the builder cannot pass on input tax credit, so the rate you pay is the final GST cost." },
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
    title: "Property Appreciation Calculator: Future Value",
    metaDescription:
      "Project the future value of a property from an expected growth rate, or work out the CAGR between two values. See the total gain over your holding period.",
    keywords: ["property appreciation calculator", "property future value calculator", "real estate cagr calculator", "property growth calculator"],
    intro:
      "Use this property appreciation calculator to project the future value of a property from an expected annual growth rate, or to work out the CAGR between two values. Enter a value, a growth rate, and a holding period to see the future value and the total gain.",
    howItWorks:
      "Property value grows by compounding, with the formula FV = PV x (1 + g)^n, where g is the annual growth rate and n is the number of years. For example, a 50 lakh property growing at 7 percent a year is worth about 98 lakh after 10 years. The calculator can also reverse this to find the CAGR, the steady annual rate that took a property from one value to another.",
    heroArt: `${ART}/property-appreciation.svg`,
    faq: [
      { q: "How do I calculate property appreciation?", a: "Compound the current value forward with FV = PV x (1 + g)^n, where g is the annual growth rate and n is the number of years. Enter your figures above and the calculator does it and shows the total gain." },
      { q: "What is a realistic property appreciation rate in India?", a: "Indian residential property has historically grown at around 6 to 9 percent a year on average, though this varies widely by city, micro market, and cycle. Fast growing corridors can do better, and stagnant areas worse." },
      { q: "What is CAGR in real estate?", a: "CAGR is the compound annual growth rate, the single steady yearly rate that takes a property from its purchase value to its current or sale value over the holding period. It smooths out the ups and downs into one comparable number." },
      { q: "Does property always appreciate?", a: "No. Property generally appreciates over long periods, but prices can stay flat or fall for years in an over supplied or poorly located market. Location, infrastructure, and timing drive the difference." },
      { q: "Does this calculator account for costs and tax?", a: "No, it shows gross appreciation only. Buying costs, maintenance, and capital gains tax on sale all reduce your real return, so treat the gain shown as before costs." },
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
      "Calculate the gross and net rental yield on a property in India from the rent, value, and expenses. See whether a property is a strong rental investment.",
    keywords: ["rental yield calculator", "gross rental yield", "net rental yield", "rental yield in india"],
    intro:
      "Use this rental yield calculator to work out the gross and net rental yield on a property. Enter the property value, the monthly rent, and annual expenses to see your yield, the annual rental return as a percentage of the property's value.",
    howItWorks:
      "Gross yield is the annual rent divided by the property value, shown as a percentage. Net yield goes further and subtracts annual costs like maintenance, property tax, insurance, and a vacancy allowance before dividing, so it reflects what you actually keep. For example, a 50 lakh flat rented at 20,000 a month earns 2.4 lakh a year, a gross yield of 4.8 percent, and rather less once costs are counted.",
    heroArt: `${ART}/rental-yield.svg`,
    faq: [
      { q: "What is a good rental yield in India?", a: "Residential rental yields of 3.5 to 5 percent are common in India, and a net yield above 4 percent is generally considered healthy. Commercial property usually yields more, often 6 to 9 percent." },
      { q: "What is the difference between gross and net rental yield?", a: "Gross yield ignores costs and is simply annual rent divided by value. Net yield subtracts maintenance, property tax, insurance, and a vacancy allowance first, so it reflects the real return you take home." },
      { q: "Is rental yield calculated monthly or yearly?", a: "Yearly. Rental yield is always expressed on an annual basis, so monthly rent is multiplied by twelve before it is divided by the property value." },
      { q: "Does rental yield include expenses?", a: "Gross yield does not. Net yield does, subtracting your running costs from the annual rent before the calculation, which is why net yield is the more honest figure for an investor." },
      { q: "Should I include vacancy in the expenses?", a: "Yes. A realistic estimate sets aside around one month of rent a year for vacancy and adds it to expenses, so the net yield reflects periods when the property sits empty between tenants." },
      { q: "Is rental income taxable in India?", a: "Yes. Rental income is taxed under income from house property, after a standard 30 percent deduction and any home loan interest. The yield shown here is before tax, so your after tax return is lower." },
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
    title: "Down Payment Calculator: Save for Your Home",
    metaDescription:
      "Plan how much to save each month to reach your home down payment by your target date in India, allowing for returns on your savings.",
    keywords: ["down payment calculator", "down payment planner", "save for home down payment", "home down payment"],
    intro:
      "Use this down payment planner to work out how much to save each month to reach your home down payment by your target date. Enter the property value, the down payment share, your timeline, and an expected return on savings to see your monthly target.",
    howItWorks:
      "The down payment you need is the property value minus the loan the bank will give, bounded by the LTV limit, usually 10 to 25 percent of the price. To reach that by your target date, the required monthly saving is derived from a SIP style formula that allows for growth on what you invest, so a higher expected return means a smaller monthly outlay.",
    heroArt: `${ART}/down-payment-planner.svg`,
    faq: [
      { q: "How much down payment do I need for a house in India?", a: "Lenders finance 75 to 90 percent of the property value, so plan for a down payment of 10 to 25 percent, plus stamp duty and registration on top. The planner works out the exact amount from your property value." },
      { q: "Is a down payment mandatory for a home loan?", a: "Yes. The RBI caps the loan at 75 to 90 percent of value depending on the loan size, so you must fund the rest yourself. There is no genuine zero down payment home loan for a standard purchase." },
      { q: "How much is a good down payment?", a: "A larger down payment lowers your loan, EMI, and total interest, so pay as much as you comfortably can while keeping an emergency buffer. Many buyers aim for 20 percent plus the registration costs." },
      { q: "Where should I keep my down payment savings?", a: "For a short horizon of one to three years, lower risk options like recurring deposits or short duration debt funds are safer than equity. The planner lets you set an expected return to match your choice." },
      { q: "Do I need to save for more than the down payment?", a: "Yes. Budget for stamp duty, registration, and any GST as well, since these are paid separately from the loan, along with brokerage and moving or interior costs." },
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

// General FAQ for the hub (pillar) page. Feeds both the visible accordion and
// the hub FAQPage JSON-LD, so the two never drift.
export const HUB_FAQ: CalculatorFaq[] = [
  { q: "Are these financial calculators free to use?", a: "Yes, every calculator here is completely free, with no login and no limit on how many times you use it. You can run your numbers as often as you like." },
  { q: "How accurate are the results?", a: "The maths follows the same reducing balance, FOIR, LTV, and tax rules that banks and state governments use, so the results are accurate estimates. Your actual figures can vary slightly with a lender's fees, rounding, and current rates." },
  { q: "Do you store the numbers I enter?", a: "No. Every calculation runs in your browser, so your income, loan, and property figures stay on your device and are never sent to us unless you choose to request a callback." },
  { q: "Which calculator should I use?", a: "Start with the EMI or loan eligibility calculator if you are taking a loan, and the home affordability, stamp duty, or down payment planner if you are buying property. Each page links to the related calculators you are likely to need next." },
  { q: "Are the calculators built for India?", a: "Yes. Every calculator uses Indian conventions, rupees, EMIs, state wise stamp duty, GST on under construction homes, and the FOIR and LTV limits Indian lenders apply." },
  { q: "Can you help me apply after I calculate?", a: "Yes. Once you have your numbers, leave your phone number on any calculator and our loans or real estate team will call you back to take it forward." },
];

export const CALCULATOR_SLUGS: CalculatorSlug[] = CALCULATORS.map((c) => c.slug);

const BY_SLUG = new Map(CALCULATORS.map((c) => [c.slug, c]));

export function getCalculator(slug: string): CalculatorDef | undefined {
  return BY_SLUG.get(slug as CalculatorSlug);
}
