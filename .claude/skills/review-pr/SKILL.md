---
name: review-pr
description: Review a branch, working tree, commit range, or pull request for actionable correctness, security, compatibility, and test defects. Use before shipping or whenever the user asks for code review or PR review.
---

# Review PR

Review like a maintainer responsible for production behavior.

1. Identify the intended base and review the complete diff, commit context, PR description when available, and relevant requirements.
2. Read adjacent implementation and tests; a diff alone is insufficient to judge behavior or existing safeguards.
3. Verify each changed path for incorrect behavior, missing cases, authorization/RLS leakage, compatibility breaks, races, data loss, migration hazards, generated-contract drift, accessibility regressions, and operational failure.
4. Check that tests exercise the changed behavior and meaningful negative paths. Never claim tests passed unless their current output was observed.
5. Report only actionable findings that the author would reasonably fix. Each finding must include severity, precise location, triggering scenario, impact, and why existing tests or guards do not prevent it.
6. Order findings by severity. Keep summary brief after findings. If there are no findings, state that explicitly and list residual test or environment gaps.

Do not edit in a review-only request. During `$work-feature` or `/work-feature`, fix valid self-review findings, re-run affected verification, and repeat the review before shipping.
