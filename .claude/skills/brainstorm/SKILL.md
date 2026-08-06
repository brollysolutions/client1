---
name: brainstorm
description: Explore a feature, product idea, architecture change, or ambiguous implementation before code is written. Use when the user asks to brainstorm, shape an idea, compare approaches, settle scope, or design behavior with meaningful tradeoffs.
---

# Brainstorm

Turn an idea into a decision-ready design without implementing it.

1. Read `AGENTS.md`, the closest nested instructions, `SECURITY.md`, `docs/agent-context/INDEX.md`, and the code/tests most relevant to the idea. Distinguish existing behavior from assumptions.
2. Restate the problem, intended user, desired outcome, constraints, and explicit non-goals. Call out contradictions or missing success criteria.
3. Ask only the highest-leverage question at a time. Prefer concrete choices when the options are understood; keep asking while an answer would materially change the design.
4. Develop two or three viable approaches. For each, compare user experience, architecture fit, data/API impact, security/privacy, migration/rollout, testing, operational cost, and reversibility.
5. Recommend one approach and explain why it best fits this repository. Do not hide disadvantages.
6. Produce a compact decision brief with:
   - problem and success measures;
   - selected behavior and user flow;
   - architecture/data/API changes;
   - security and failure handling;
   - rollout and verification plan;
   - rejected alternatives;
   - open decisions and non-goals.
7. Ask for approval of the design. Do not edit implementation files, commit, push, or open a PR during brainstorming unless the user explicitly expands the task.

After approval, hand the brief to `$work-feature` (Codex) or `/work-feature` (Claude Code).
