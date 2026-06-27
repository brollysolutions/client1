---
paths:
  - "apps/api/app/cache/**"
  - "apps/api/app/services/**"
  - "apps/api/app/jobs/**"
---

# Redis Rules

Every cache entry must define:
- key namespace
- version
- TTL
- owner/service
- invalidation strategy

Rules:
- Never cache user-sensitive data without explicit review.
- Never rely on Redis as the only durable store for business data.
- Locks must have TTLs.
- Critical job idempotency must survive retries.
- Add tests for cache hit, miss, stale, and invalidation behavior.

This product's locked Redis scope: OTP store/rate-limit (`otp:*`, `otp_resend:*`, `otp_lock:*`,
`otp_rate:*`), login throttle (`login_fail:*`, `login_lock:*`), and JWT blacklist
(`jwt_blacklist:{jti}`). Add new keys only when measured load justifies it.
