---
name: systematic-debug
description: Diagnose and fix a reproducible bug, failing test, regression, race, or unexpected behavior by finding the root cause before editing. Use whenever the user reports broken behavior or asks to debug or fix a defect.
---

# Systematic Debug

Prove the cause before choosing the fix.

1. Read the repository instructions and trace the failing path across all relevant layers.
2. Reproduce the problem with the smallest reliable command or scenario. Capture the actual output, environment, inputs, and expected behavior. If reproduction is impossible, state what evidence is missing.
3. Check recent related history and compare a working analogue. Follow data and control flow backward from the symptom.
4. Form a short ranked hypothesis list. Test one discriminating observation at a time; do not stack speculative fixes.
5. Identify the root cause and explain why it produces the observed symptom. Check whether the same cause affects adjacent roles, business lines, endpoints, jobs, or UI states.
6. Add a regression test that fails for the correct reason. For races or retries, prefer deterministic synchronization/state assertions over sleeps.
7. Apply the smallest root-cause fix. Avoid catch-all suppression, weakened validation, disabled security controls, or unrelated refactors.
8. Re-run the reproduction, regression test, neighboring tests, and the full applicable verification. Inspect logs/output rather than relying on an exit-code assumption.
9. Review the diff with `$security-review` when a protected invariant is involved and `$review-pr` before shipping.
10. Invoke `$ship`/`/ship` automatically and report the root cause, fix, tests, and PR.
