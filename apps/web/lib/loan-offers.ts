// Mock loan-offer catalog for the dashboard's Compare Loan Offers page. No
// backend catalog exists — loan_types/banks are plain reference tables (name +
// label only); interest rate / processing fee only exist per submitted
// loan_applications row, never as a browsable pre-application catalog. Bank
// names here are fictional, never a real institution.

export type LoanOfferType =
  | "personal-loan"
  | "business-loan"
  | "property-loan"
  | "vehicle-loan"
  | "education-loan";

export type LoanOffer = {
  id: string;
  loanType: LoanOfferType;
  bankName: string;
  interestRate: string; // "10.5% p.a."
  maxTenure: string; // "5 years"
  maxAmount: string; // "₹40 L"
  processingFee: string; // "₹2,999" or "1%"
};

export const LOAN_TYPES: { key: LoanOfferType; label: string }[] = [
  { key: "personal-loan", label: "Personal Loan" },
  { key: "business-loan", label: "Business Loan" },
  { key: "property-loan", label: "Property Loan" },
  { key: "vehicle-loan", label: "Vehicle Loan" },
  { key: "education-loan", label: "Education Loan" },
];

export const LOAN_OFFERS: LoanOffer[] = [
  { id: "pl1", loanType: "personal-loan", bankName: "Horizon Bank", interestRate: "10.5% p.a.", maxTenure: "5 years", maxAmount: "₹20 L", processingFee: "1%" },
  { id: "pl2", loanType: "personal-loan", bankName: "Metro Finance", interestRate: "11.2% p.a.", maxTenure: "4 years", maxAmount: "₹15 L", processingFee: "₹2,999" },
  { id: "pl3", loanType: "personal-loan", bankName: "Capital Trust Bank", interestRate: "10.9% p.a.", maxTenure: "6 years", maxAmount: "₹25 L", processingFee: "1.5%" },
  { id: "bl1", loanType: "business-loan", bankName: "Horizon Bank", interestRate: "12.5% p.a.", maxTenure: "7 years", maxAmount: "₹1 Cr", processingFee: "2%" },
  { id: "bl2", loanType: "business-loan", bankName: "Metro Finance", interestRate: "13.1% p.a.", maxTenure: "5 years", maxAmount: "₹75 L", processingFee: "1.5%" },
  { id: "bl3", loanType: "business-loan", bankName: "Northgate Bank", interestRate: "12.8% p.a.", maxTenure: "6 years", maxAmount: "₹90 L", processingFee: "2%" },
  { id: "prl1", loanType: "property-loan", bankName: "Capital Trust Bank", interestRate: "9.2% p.a.", maxTenure: "15 years", maxAmount: "₹2 Cr", processingFee: "0.5%" },
  { id: "prl2", loanType: "property-loan", bankName: "Northgate Bank", interestRate: "9.5% p.a.", maxTenure: "12 years", maxAmount: "₹1.5 Cr", processingFee: "1%" },
  { id: "prl3", loanType: "property-loan", bankName: "Horizon Bank", interestRate: "9.4% p.a.", maxTenure: "15 years", maxAmount: "₹2.5 Cr", processingFee: "0.75%" },
  { id: "vl1", loanType: "vehicle-loan", bankName: "Metro Finance", interestRate: "8.9% p.a.", maxTenure: "7 years", maxAmount: "₹15 L", processingFee: "₹1,999" },
  { id: "vl2", loanType: "vehicle-loan", bankName: "Northgate Bank", interestRate: "9.1% p.a.", maxTenure: "6 years", maxAmount: "₹10 L", processingFee: "₹2,499" },
  { id: "vl3", loanType: "vehicle-loan", bankName: "Capital Trust Bank", interestRate: "8.7% p.a.", maxTenure: "7 years", maxAmount: "₹20 L", processingFee: "1%" },
  { id: "el1", loanType: "education-loan", bankName: "Horizon Bank", interestRate: "9.8% p.a.", maxTenure: "10 years", maxAmount: "₹40 L", processingFee: "0.5%" },
  { id: "el2", loanType: "education-loan", bankName: "Northgate Bank", interestRate: "10.1% p.a.", maxTenure: "8 years", maxAmount: "₹30 L", processingFee: "₹4,999" },
  { id: "el3", loanType: "education-loan", bankName: "Metro Finance", interestRate: "9.6% p.a.", maxTenure: "10 years", maxAmount: "₹35 L", processingFee: "0.5%" },
];

export function getOffersByType(type: LoanOfferType): LoanOffer[] {
  return LOAN_OFFERS.filter((o) => o.loanType === type);
}

export function getOfferById(id: string): LoanOffer | undefined {
  return LOAN_OFFERS.find((o) => o.id === id);
}
