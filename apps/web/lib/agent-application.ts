// Public agent-application submit seam for /apply-as-agent.
//
// There is no public POST /api/v1/agent-applications endpoint yet (see
// agent_applications in apps/api/app/models/profile.py): it needs OTP-verify
// on the mobile before insert, a file-storage subsystem for the KYC uploads,
// and its own security review, all as a separate follow-up PR. Until that
// lands, this stub:
//   - keeps the existing text fields flowing through submitLead (lib/leads.ts),
//     so the "we'll call you back" pipeline still works today
//   - gathers the 4 KYC Files + rera_code into the shape the future endpoint
//     will expect (dev-logged only) but never transmits them anywhere
// When the endpoint lands, replace the body below with a multipart POST
// carrying the gathered fields; the exported type and callers stay the same.

import { submitLead, type LeadBusinessLine } from "@/lib/leads";
import { normalizeMobile, toE164 } from "@/lib/phone";

export type AgentApplicationInput = {
  firstName: string;
  lastName: string;
  mobile: string;
  email: string;
  businessLine: LeadBusinessLine;
  rera?: string;
  aadhaar: File;
  pan: File;
  photo: File;
  addressProof: File;
};

export type AgentApplicationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function submitAgentApplication(
  input: AgentApplicationInput,
): Promise<AgentApplicationResult> {
  // TODO(agent-apply): POST multipart/form-data to the public
  // agent-application endpoint once it exists: first_name, last_name,
  // toE164(mobile), business_line, rera_code, plus the 4 KYC files below.
  // The endpoint stores each file in object storage and writes the *_ref
  // columns; email needs its own migration first (agent_applications has no
  // email column yet). Files are gathered here but NOT transmitted.
  if (process.env.NODE_ENV !== "production") {
    console.info("[agent-application] stub submit (not transmitted)", {
      first_name: input.firstName,
      last_name: input.lastName,
      mobile: toE164(input.mobile),
      email: input.email,
      business_line: input.businessLine,
      rera_code: input.rera,
      documents: {
        aadhaar: input.aadhaar.name,
        pan: input.pan.name,
        photo: input.photo.name,
        address_proof: input.addressProof.name,
      },
    });
  }

  return submitLead({
    name: `${input.firstName} ${input.lastName}`.trim(),
    mobile: normalizeMobile(input.mobile),
    business_line: input.businessLine,
    origin: "agent-application-page",
    email: input.email,
  });
}
