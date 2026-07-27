// Referral code helpers shared by the client referral card (share links) and
// the register form (client-side format check, matching normalize before
// the same regex is applied server-side in core/security.py).
//
// URL builders are frontend-only by design (docs/specs/referral-program.md
// D14): the API returns just the bare code, never a share_url — there is no
// PUBLIC_WEB_URL setting, and a misconfigured one would produce broken links
// already sent over WhatsApp. window.location.origin can't be wrong, so
// callers always pass it in.

// Same alphabet as core/security.py's Crockford base32 (no I/L/O/U).
const REFERRAL_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{8}$/;
// Crockford's own reading aliases, mirroring normalize_referral_code: a
// human transcribing a code types O for 0, I/L for 1.
const ALIASES: Record<string, string> = { O: "0", I: "1", L: "1" };

/** Strip/uppercase/alias a user-entered referral code, same rules as the backend. */
export function normalizeReferralCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[OIL]/g, (c) => ALIASES[c]);
}

export function isValidReferralCodeFormat(normalized: string): boolean {
  return REFERRAL_CODE_RE.test(normalized);
}

/** e.g. ("https://brolly.example", "AB12CD34") -> "https://brolly.example/register?ref=AB12CD34". */
export function buildRegisterUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/register?ref=${encodeURIComponent(code)}`;
}

/**
 * A wa.me share link with no destination number — opens WhatsApp's own
 * contact picker/share sheet with the message pre-filled, same as the
 * "Share on WhatsApp" pattern (distinct from toWaHref elsewhere, which opens
 * a chat with a specific lead's number).
 */
export function buildWaMeUrl(origin: string, code: string): string {
  const registerUrl = buildRegisterUrl(origin, code);
  const message = `Join me on this app! Use my referral code ${code} when you sign up: ${registerUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
