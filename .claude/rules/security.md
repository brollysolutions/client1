# Security Rules

- Never read or print secrets unless explicitly asked.
- Never commit secrets.
- Never put secrets in examples except obvious placeholders.
- Validate all external input.
- Use parameterized queries.
- Check authz, not only authn.
- Do not expose stack traces to users.
- Do not log PII, tokens, passwords, cookies, or auth headers.
- For auth, payments, uploads, webhooks, admin screens, and migrations, request security review.

This product:
- Authorization is enforced by Postgres RLS + app checks, never UI hiding alone.
- OTP is 6 digits, hashed in Redis, single-use, 5-attempt cap; rate-limit `initiate` endpoints
  per mobile and per IP (abuse + SMS-cost control).
- Passwords: argon2id (or bcrypt with SHA-256 pre-hash); never reveal which login field was wrong.
- Refresh tokens are httpOnly+Secure+SameSite=Strict, rotated on every use; reuse of a revoked
  token revokes the chain.
- Treat mobile numbers, KYC docs, and income data as sensitive PII.
