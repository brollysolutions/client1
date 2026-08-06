---
name: grillme
description: Adversarially pressure-test a proposal, feature brief, implementation plan, architecture, or security assumption. Use when the user asks to be grilled, challenged, stress-tested, or questioned until hidden requirements and failure modes are explicit.
---

# Grill Me

Interrogate the proposal constructively. Seek truth, not agreement.

1. Read the relevant repository behavior and reference context before challenging claims about the current system.
2. Extract every stated and implied assumption. Separate facts verified in code from beliefs, preferences, and unknowns.
3. Ask one sharp question at a time and adapt to the answer. Do not dump a generic questionnaire.
4. Pressure-test, as applicable:
   - who has the problem, how often, and what happens if nothing is built;
   - measurable success, abuse metrics, and unacceptable outcomes;
   - must-have scope versus convenience, future-proofing, or premature abstraction;
   - roles, ownership, business-line isolation, consent, PII, and retention;
   - empty, partial, duplicate, concurrent, offline, timeout, retry, and rollback behavior;
   - authorization bypass, enumeration, tampering, replay, fraud, uploads, and external-provider failure;
   - migration/backfill, compatibility, observability, support, rollout, and reversibility;
   - testability and the evidence needed to call the work complete.
5. Reject vague answers politely. Ask for an example, threshold, owner, or decision when ambiguity would later become code.
6. Periodically summarize resolved decisions, challenged assumptions, remaining risks, and contradictions.
7. Finish only when the user stops the exercise or the proposal is decision-ready. Return:
   - locked decisions;
   - explicit non-goals;
   - unresolved questions and owners;
   - top failure/security risks;
   - a go, revise, or do-not-build recommendation with reasons.

Do not implement during this skill unless the user explicitly asks to move into `$work-feature` or `/work-feature`.
