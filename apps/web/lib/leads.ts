// Landing-page lead capture.
//
// Shape mirrors the backend lead service (apps/api/app/services/leads.py):
// mobile + optional name + business_line + origin. There is no PUBLIC lead
// endpoint yet — capture_lead is only called internally from the auth flows —
// so this is a stub that fakes a successful submit. When the public endpoint
// lands, swap the body for the generated typed client call; the interface and
// the callers stay the same.

export type LeadBusinessLine = "loans" | "real_estate";

export type LeadInput = {
  name: string;
  mobile: string;
  business_line: LeadBusinessLine;
  origin: string;
  // Optional product/offering the lead enquired about (e.g. "Personal Loan").
  // Captured from the per-card Enquire button; the backend can map it later.
  product?: string;
  // Optional extras from the /contact page form. The backend can map these
  // later (email → profile, message → Lead.requirement JSONB). Ignored by the
  // stub below.
  email?: string;
  message?: string;
};

export type LeadResult = { ok: true } | { ok: false; error: string };

// TODO(leads): wire to POST /api/v1/leads once the public endpoint exists
// (unauthenticated write → needs rate-limit + security review). Until then this
// resolves to success after a short delay so the form UX is exercisable.
export async function submitLead(input: LeadInput): Promise<LeadResult> {
  await new Promise((resolve) => setTimeout(resolve, 700));

  if (process.env.NODE_ENV !== "production") {
    console.info("[leads] stub submit", input);
  }

  return { ok: true };
}
