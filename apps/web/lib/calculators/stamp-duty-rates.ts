// Indicative state-wise stamp duty and registration rates (percent of property
// value). Several states charge women buyers a lower stamp duty, so male/female
// rates are held separately. These are illustrative reference figures; actual
// rates depend on the state, locality, property type, and current notifications,
// and change from time to time.

export interface StampDutyState {
  code: string;
  name: string;
  /** Stamp duty % for a male / general buyer. */
  stampDutyMale: number;
  /** Stamp duty % for a female buyer (equal to male where no concession). */
  stampDutyFemale: number;
  /** Registration charge % (most states ~1%). */
  registration: number;
}

export const STAMP_DUTY_STATES: StampDutyState[] = [
  { code: "AP", name: "Andhra Pradesh", stampDutyMale: 5, stampDutyFemale: 5, registration: 1 },
  { code: "AS", name: "Assam", stampDutyMale: 6, stampDutyFemale: 6, registration: 1 },
  { code: "BR", name: "Bihar", stampDutyMale: 6, stampDutyFemale: 5.7, registration: 2 },
  { code: "CG", name: "Chhattisgarh", stampDutyMale: 5, stampDutyFemale: 4, registration: 1 },
  { code: "DL", name: "Delhi", stampDutyMale: 6, stampDutyFemale: 4, registration: 1 },
  { code: "GA", name: "Goa", stampDutyMale: 5, stampDutyFemale: 5, registration: 3 },
  { code: "GJ", name: "Gujarat", stampDutyMale: 4.9, stampDutyFemale: 4.9, registration: 1 },
  { code: "HR", name: "Haryana", stampDutyMale: 7, stampDutyFemale: 5, registration: 1 },
  { code: "HP", name: "Himachal Pradesh", stampDutyMale: 5, stampDutyFemale: 4, registration: 1 },
  { code: "JH", name: "Jharkhand", stampDutyMale: 4, stampDutyFemale: 4, registration: 3 },
  { code: "KA", name: "Karnataka", stampDutyMale: 5, stampDutyFemale: 5, registration: 1 },
  { code: "KL", name: "Kerala", stampDutyMale: 8, stampDutyFemale: 8, registration: 2 },
  { code: "MP", name: "Madhya Pradesh", stampDutyMale: 7.5, stampDutyFemale: 7.5, registration: 3 },
  { code: "MH", name: "Maharashtra", stampDutyMale: 6, stampDutyFemale: 5, registration: 1 },
  { code: "OD", name: "Odisha", stampDutyMale: 5, stampDutyFemale: 4, registration: 2 },
  { code: "PB", name: "Punjab", stampDutyMale: 7, stampDutyFemale: 5, registration: 1 },
  { code: "RJ", name: "Rajasthan", stampDutyMale: 6, stampDutyFemale: 5, registration: 1 },
  { code: "TN", name: "Tamil Nadu", stampDutyMale: 7, stampDutyFemale: 7, registration: 4 },
  { code: "TS", name: "Telangana", stampDutyMale: 5, stampDutyFemale: 5, registration: 0.5 },
  { code: "UP", name: "Uttar Pradesh", stampDutyMale: 7, stampDutyFemale: 6, registration: 1 },
  { code: "UK", name: "Uttarakhand", stampDutyMale: 5, stampDutyFemale: 3.75, registration: 2 },
  { code: "WB", name: "West Bengal", stampDutyMale: 6, stampDutyFemale: 6, registration: 1 },
];

export type StampDutyBuyer = "male" | "female";

const BY_CODE = new Map(STAMP_DUTY_STATES.map((s) => [s.code, s]));

/** Default state for the initial calculator render. */
export const DEFAULT_STATE_CODE = "MH";

export function getStampDutyState(code: string): StampDutyState | undefined {
  return BY_CODE.get(code);
}

/** Resolve the applicable stamp duty % for a state and buyer. */
export function stampDutyRateFor(state: StampDutyState, buyer: StampDutyBuyer): number {
  return buyer === "female" ? state.stampDutyFemale : state.stampDutyMale;
}
