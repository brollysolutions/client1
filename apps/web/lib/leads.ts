// Landing-page lead capture, wired to the public POST /api/v1/leads endpoint
// (apps/api/app/api/v1/leads.py; contract in packages/contracts). The wire
// shape uses `topic` (loans | real_estate); this module keeps the
// older business_line field name so the many existing callers stay unchanged.

import { apiRequest } from "@/lib/api/client";
import { toE164 } from "@/lib/phone";

export type LeadBusinessLine = "loans" | "real_estate";

export type LeadTopic = LeadBusinessLine;

export type LeadInput = {
  name: string;
  mobile: string;
  business_line: LeadTopic;
  origin: string;
  // Optional product/offering the lead enquired about (e.g. "Personal Loan").
  // Captured from the per-card Enquire button; the backend can map it later.
  product?: string;
  // Optional extras from the /contact page form; the backend folds them into
  // Lead.requirement JSONB.
  email?: string;
  message?: string;
  // Honeypot: hidden input humans never see. Non-empty = automation; the
  // backend answers 202 but writes nothing.
  company?: string;
  // Opaque, provider-neutral contact invitation. It never contains PII.
  invitation_token?: string;
};

export type LeadResult = { ok: true } | { ok: false; error: string };

// Builds a /contact URL carrying the source line + product so the contact form
// can prefill and the telecaller sees what the visitor came for. Used by the
// public CTAs (Enquire / callback / advisor) that route to the contact page
// instead of opening the inline lead modal.
export function contactHref(params?: {
  line?: LeadTopic;
  product?: string;
}): string {
  const sp = new URLSearchParams();
  if (params?.line) sp.set("line", params.line);
  if (params?.product) sp.set("product", params.product);
  const qs = sp.toString();
  return qs ? `/contact?${qs}` : "/contact";
}

export async function submitLead(input: LeadInput): Promise<LeadResult> {
  const res = await apiRequest<{ ok: boolean }>("/api/v1/leads", {
    method: "POST",
    body: {
      name: input.name,
      // Callers pass a normalized 10-digit mobile; the endpoint expects E.164.
      mobile: toE164(input.mobile),
      topic: input.business_line,
      origin: input.origin,
      ...(input.product ? { product: input.product } : {}),
      ...(input.email ? { email: input.email } : {}),
      ...(input.message ? { message: input.message } : {}),
      ...(input.company ? { company: input.company } : {}),
      ...(input.invitation_token ? { invitation_token: input.invitation_token } : {}),
    },
  });

  if (res.ok) return { ok: true };
  return { ok: false, error: res.error };
}
