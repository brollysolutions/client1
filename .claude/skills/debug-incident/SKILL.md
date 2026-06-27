---
name: debug-incident
description: Systematically debug an issue down to root cause and add a regression test.
tools:
  - Read
  - Glob
  - Grep
  - Bash
---

# Debug Incident

1. Reproduce, or explain why it cannot be reproduced.
2. Read logs / tests / code paths.
3. Form 2-3 hypotheses.
4. Test the cheapest hypothesis first.
5. Identify root cause.
6. Implement the smallest fix.
7. Add a regression test at the lowest layer that would have caught it.
8. Run `./scripts/verify.sh --changed`.

Return: root cause, fix, test added, verification evidence, residual risk.
