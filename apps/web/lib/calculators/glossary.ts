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

  // Card payoff
  cardBalance: "The amount outstanding on your credit card statement right now.",
  cardApr:
    "The card's yearly interest rate. Most cards charge 3 to 4 percent a month, which is 36 to 48 percent a year.",
  monthlyCardPayment: "The fixed amount you commit to paying against the card every month.",
  minimumDue:
    "The smallest payment the bank accepts, usually 5 percent of the statement. Paying only this keeps you in debt for years.",
  gstOnCardInterest:
    "Card interest carries 18 percent GST on top, unlike loan interest. It adds up faster than most people expect.",
  payoffMonths: "How many months until the card balance reaches zero at this payment.",
  payoffTotalPaid: "Everything you hand the bank on this path: balance, interest, and GST.",
  savedVsMinDue:
    "The interest and GST you avoid by paying your fixed amount instead of only the minimum due.",

  // Card EMI conversion
  cardEmiAmount: "The purchase or outstanding amount you are converting into EMIs.",
  cardEmiRate:
    "The interest rate the bank quotes for the conversion, usually much lower than the card's normal rate.",
  cardProcessingFee: "The one-time fee for setting up the conversion. GST applies on it.",
  effectiveCardRate:
    "What the conversion really costs per year once the fee and GST are counted. Always higher than the quoted rate.",
  cardEmiTotalCost: "Everything you pay for the conversion: amount, interest, GST, and fee.",
  firstMonthOutflow:
    "Your real first-month payment: the EMI plus GST on that month's interest.",
  vsRevolving:
    "What the same monthly amount would cost if you skipped the conversion and kept revolving at the card's normal rate.",

  // Term insurance cover
  termAge: "Your current age. Younger earners need more years of income replaced.",
  annualIncome: "Your yearly income before tax. The cover replaces this for your family.",
  monthlyHouseholdExpenses:
    "What your household spends in a month. Used to work out the expenses your family would still face.",
  outstandingLoans:
    "Loans your family would have to repay without you: home, car, personal, everything.",
  existingCover: "Life cover you already hold, across all policies including employer cover.",
  liquidAssets:
    "Savings your family could use quickly: deposits, mutual funds, stocks. Not the house they live in.",
  recommendedCover:
    "The larger of the two methods, rounded up to the next 25 lakh. Under-covering is the mistake to avoid.",
  incomeMethodCover:
    "Cover as a multiple of your yearly income, the multiple shrinking as you age.",
  expenseMethodCover:
    "Cover that funds your household's expenses until you would have turned 60.",

  // Health insurance cover
  cityTier:
    "Where you would be hospitalised. Metro hospital bills run far higher than smaller cities.",
  adultsCovered: "Adults on the family floater. Children add little to the premium.",
  seniorMember: "Whether anyone covered is 60 or older. A floater is priced on the eldest member.",
  suggestedHealthCover: "The floater size that covers a serious hospitalisation where you live.",
  healthCoverBand:
    "A comfortable range for your situation. Pick the higher end if you can afford the premium.",

  // Balance transfer
  btOutstanding: "The principal still left on your running loan, from your latest statement.",
  btRemainingTenure: "The months left on your loan as it stands today.",
  btCurrentRate: "The rate you pay now on the running loan.",
  btNewRate: "The rate the new lender is offering you.",
  btFees:
    "Everything the switch costs: the new lender's processing fee plus fixed charges like stamp and legal.",
  btMonthlySaving: "How much lower the new EMI is each month at the same tenure.",
  btNetSaving: "Interest saved over the tenure minus everything the switch costs.",
  btBreakEven: "The month the EMI savings have paid back the switching costs.",

  // Flat vs reducing
  flatRate:
    "A rate charged on the full amount for the whole tenure, even as you repay. Common on car and personal loans.",
  flatEmi: "The EMI a flat quote produces: principal plus all the flat interest, split evenly.",
  effectiveReducingRate:
    "The honest rate a flat quote hides. A 10 percent flat quote costs about the same as 17 percent reducing.",
  flatExtraPaid:
    "The extra interest the flat quote costs over a reducing-balance loan at the same number.",

  // Rent vs buy
  rentYouPay: "What you pay in rent today for a comparable home.",
  rentGrowth: "How much your rent rises each year. Most Indian leases step up 5 to 10 percent.",
  appreciationRate: "How much the property's value grows each year.",
  investmentReturn:
    "What your money earns if you rent and invest the difference instead of buying.",
  rvbHorizon: "How long you plan to stay. Buying usually needs years to pull ahead.",
  homeEquity: "The buyer's wealth: what the home is worth minus what is still owed on the loan.",
  renterCorpus:
    "The renter's wealth: the invested down payment and every rupee saved versus the owner, grown at your return.",
  buyAdvantage:
    "Home equity minus the renter's corpus. Positive means buying wins by then, negative means renting is ahead.",
  rvbBreakEven: "The first year owning pulls ahead of renting, if it happens in your horizon.",
} as const;

export type InfoKey = keyof typeof INFO;
