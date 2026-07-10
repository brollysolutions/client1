export interface RentalYieldInputs {
  propertyValue: number;
  monthlyRent: number;
  /** Annual costs: maintenance, property tax, insurance, vacancy reserve. */
  annualExpenses?: number;
}

export interface RentalYieldResult {
  annualRent: number;
  /** Gross yield %: annual rent / property value. */
  grossYield: number;
  /** Net yield %: (annual rent - expenses) / property value. */
  netYield: number;
}

export function rentalYield({
  propertyValue,
  monthlyRent,
  annualExpenses = 0,
}: RentalYieldInputs): RentalYieldResult {
  const annualRent = monthlyRent * 12;
  if (propertyValue <= 0) return { annualRent, grossYield: 0, netYield: 0 };
  return {
    annualRent,
    grossYield: (annualRent / propertyValue) * 100,
    netYield: ((annualRent - annualExpenses) / propertyValue) * 100,
  };
}
