---
name: ingest-context
description: Add user-supplied product, policy, SRS, design, architecture, or example documents to the repository's agent context and reconcile them with current code. Use when the user pastes, uploads, links, or asks to preserve reference documents for future feature work.
---

# Ingest Context

Make future agents able to use supplied documents without treating stale text as unquestioned truth.

1. Determine whether the material is user-supplied/owned, licensed for repository storage, or an external source that should be summarized rather than copied. Do not store secrets, production data, customer PII, or KYC files.
2. Preserve supplied source text faithfully under `docs/agent-context/` using a descriptive kebab-case filename. Mark summaries, OCR, or transcriptions as derived.
3. Update `docs/agent-context/INDEX.md` with source/provenance, as-of date, authority (`authoritative`, `advisory`, or `example`), affected features/paths, and known conflicts or superseded sections.
4. Compare material claims with the current implementation, tests, migrations, `SECURITY.md`, and existing indexed documents. Cite concrete paths for mismatches.
5. Never silently rewrite a source document to resolve a conflict. Record the conflict and ask the user to choose when it changes product behavior, legal/policy compliance, security, or data migration.
6. Keep agent instructions concise. Put durable workflow rules in `AGENTS.md`; keep domain/reference detail in the indexed document so it loads only when relevant.
7. Validate links and Markdown, review the diff for sensitive content, then ship the documentation change through the normal branch and PR workflow if repository files changed.
