# Contract instructions

Apply the root `AGENTS.md` plus these contract-specific rules.

- `openapi/openapi.json` and `generated/schema.d.ts` are generated artifacts; never hand-edit them.
- Change FastAPI schemas/routes first, run `./scripts/generate-openapi.sh`, then `./scripts/generate-client.sh` from the repository root.
- Commit the API change, OpenAPI document, generated TypeScript schema, frontend adaptation, and tests together when they form one compatibility change.
- Review removals, nullability changes, enum changes, auth requirements, and response-shape changes as potentially breaking.
- Finish with `git diff --exit-code packages/contracts/` after regeneration in the same environment used for validation.
