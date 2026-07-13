// Plain-language explanations for every value shown across the calculators.
// One sentence each, written for a first-time borrower or buyer, no jargon.
// Keys are shared where the same concept appears in more than one calculator so
// the wording stays consistent. Rendered through <InfoHint> next to each label.
export const INFO = {
  // Shared inputs
  loanAmount:
    "The money you borrow from the lender. You pay it back with interest over the tenure.",
  interestRate:
    "The yearly cost of the loan, shown as a percent. A higher rate means a bigger EMI.",
  tenure:
    "How long you take to repay. A longer tenure lowers the EMI but raises the total interest.",
  propertyValue:
    "The price of the property. Most charges and loan limits are worked out from this figure.",
  netMonthlyIncome: "Your take-home pay each month, after tax and deductions.",
  existingEmis:
    "EMIs you already pay on other loans each month. Lenders count these before offering a new loan.",

  // EMI results
  emi: "Equated Monthly Instalment: the fixed amount you pay every month until the loan is cleared.",
  totalInterest:
    "The extra you pay on top of the borrowed amount, added up over the whole tenure.",
  totalPayment:
    "The full amount you pay over the loan: the money borrowed plus all the interest.",

  // Loan against property
  ltv: "Loan to value: the share of the property's price a lender will lend against. Higher means a bigger loan.",
  eligibleLoan:
    "The most you can borrow against this property at the chosen loan-to-value.",

  // Loan eligibility
  foir: "Fixed Obligation to Income Ratio: the share of your income a lender lets go toward EMIs. Higher allows a bigger loan.",
  eligibleAmount:
    "The loan a lender may approve, based on your income, existing EMIs, and the rules below.",
  maxAffordableEmi:
    "The largest EMI your income can support after your existing EMIs.",
  limitFoir:
    "The loan size allowed by the income rule, your EMI capacity turned into a loan amount.",
  limitMultiple:
    "A rough cap some lenders use: a fixed multiple of your yearly income.",

  // Home affordability
  downPayment:
    "The money you pay upfront from your own pocket. The loan covers the rest.",
  maxProperty:
    "The highest property price you can target, given your loan limit plus your down payment.",
  loanYouCanTake: "The loan your income can support toward this purchase.",
  comfortableEmi: "An EMI your income can handle without stretching your budget.",

  // GST on property
  gstPayable: "The Goods and Services Tax you pay on an under-construction home.",
  gstRate: "The effective GST rate applied to the full property value.",
  totalInclGst: "The property price with GST added on.",

  // Stamp duty
  stampState:
    "Stamp duty rates are set by each state, so the state you pick changes the charge.",
  stampBuyer: "Some states charge female buyers a lower stamp duty rate.",
  stampDuty: "A state tax you pay to register the property in your name.",
  registration:
    "A separate fee to record the property in the government's land records.",
  totalCharges:
    "Stamp duty plus registration: the total you pay to register the property.",

  // Rental yield
  monthlyRent: "The rent you expect to collect each month from the property.",
  annualExpenses:
    "Yearly costs of owning it: maintenance, repairs, property tax, and the like.",
  netYield:
    "Yearly rent after expenses, as a percent of the property's price. The number that really matters.",
  grossYield:
    "Yearly rent as a percent of the property's price, before any expenses.",
  annualRent: "The total rent you collect in a year (monthly rent times twelve).",

  // Property appreciation
  currentValue: "What the property is worth today.",
  growthRate: "How much the property's value rises each year, on average.",
  holdingPeriod: "How many years you plan to hold the property before selling.",
  futureValue:
    "The projected value at the end of the holding period, at the chosen growth rate.",
  totalGain:
    "How much the value grows over the period (future value minus today's value).",
  growthPerYear: "The yearly growth rate used for this projection.",

  // Down payment planner
  downPaymentPct:
    "The share of the price you pay upfront. A bigger down payment means a smaller loan.",
  monthsToGoal: "How long you have to save up the down payment.",
  expectedReturn:
    "The yearly return you expect on your savings while you build the fund.",
  saveEachMonth:
    "The amount to set aside every month to reach your down payment in time.",
  downPaymentTarget: "The down payment amount you are saving toward.",
  loanNeeded: "The loan you'll still need after putting down your savings.",

  // Prepayment
  prepayAfter: "How far into the loan you make the extra payment.",
  lumpSum:
    "The one-time extra amount you pay toward the loan, on top of your EMIs.",
  outstandingBefore:
    "How much of the loan is still left just before you prepay.",
  newTenureAfterPrepay:
    "The shorter repayment time if you keep the EMI the same after prepaying.",
  interestSavedTenure:
    "The interest you avoid by cutting the tenure instead of the EMI.",
  newEmiAfterPrepay:
    "The lower EMI if you keep the tenure the same after prepaying.",
  interestSavedEmi: "The interest you avoid by lowering the EMI.",

  // Loan comparison
  processingFee:
    "A one-time fee the lender charges to set up the loan, as a percent of the amount.",
  compareTotalCost:
    "Everything the offer costs: amount borrowed plus interest plus fee. Lower is better.",

  // Amortization schedule
  fyYear: "The financial year (April to March) the row covers.",
  principalPortion:
    "The part of your payments that goes toward the money borrowed, not interest.",
  interestPortion:
    "The part of your payments that goes toward interest, not the borrowed amount.",
  balanceRemaining: "The loan still left to pay at that point.",
} as const;

export type InfoKey = keyof typeof INFO;
