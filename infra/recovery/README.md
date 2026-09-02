# Production recovery drill

Status: **operator execution required; this runbook does not approve launch**

This runbook covers the PostgreSQL database on the production compute host and
the external S3-compatible object bucket used by the API. It produces a
privacy-minimized, fail-closed result through
[`scripts/check_recovery_evidence.py`](../../scripts/check_recovery_evidence.py).
The unchanged example must return `NO-GO`.

The repository supplies the evidence contract and review procedure. A named
operations owner must still choose and configure an encrypted off-droplet
backup destination, execute the drill against the real production backup set,
review the provider audit records, and approve the result. Never put an archive,
credential, database row, customer identifier, object key, or production export
in Git, an issue, a PR, or chat.

## Gate definition

The recovery gate passes only when one coordinated backup set proves all of the
following:

- the worst database/object recovery-point age is within the approved RPO;
- time from the simulated incident to completed verification is within the RTO;
- database and object recovery points are within the allowed component skew;
- expected and restored database heads, schema/grant/RLS manifests, table/row
  summaries, critical-record digest, RLS policy count, and RLS-enabled relation
  count match exactly, and both heads match the release candidate's independently
  supplied expected Alembic head;
- expected and restored object count, total bytes, full-content manifest,
  content-type manifest, and database-reference summary match exactly;
- no restored database reference points to a missing object;
- backup and restore identities are separate, the target is isolated and cannot
  write to production or invoke external side effects, restored objects remain
  private, access is audited, and both data stores are encrypted;
- retention, deletion protection, an off-host copy, and an off-account or
  off-region copy have a durable protection-control audit record;
- detailed database/object/reference comparison output has a durable restricted
  reconciliation-report record.

`PASS` is engineering evidence, not a named launch approval. Any missing field,
placeholder, mismatch, failed control, stale recovery point, excessive duration,
unknown input field, or sensitive field returns `NO-GO`.

## 1. Approve the recovery policy

Before creating backups, the operations and business owners must record:

1. RPO in minutes: the maximum acceptable data-loss window.
2. RTO in minutes: the maximum time from the simulated incident until the
   restored system has passed verification.
3. Maximum database/object recovery-point skew.
4. Retention periods and deletion-protection/immutability settings.
5. The off-host and off-account or off-region copy location.
6. Named backup, restore, audit-review, and incident-decision owners.

Do not use the example values as approval. The 4-GB target-host capacity gate is
separate and remains open.

## 2. Configure backup boundaries

- Use a dedicated database backup identity. It may read the data required by
  the approved backup mechanism but must not be the API, migration, scheduler,
  or a human login identity. Audit every use.
- Use a purpose-specific object backup identity with only the source-read and
  backup-destination-write/list permissions needed for the configured prefixes.
- Keep restore credentials separate from both runtime and backup credentials.
- Use TLS in transit and provider encryption at rest. Record provider control
  IDs, not configuration values, in the evidence record.
- Store at least one copy outside the production compute host. The second copy
  must also satisfy the approved off-account or off-region boundary.
- Enable retention and deletion protection before relying on a scheduled job.
  A successful job without a successful restore is not recovery evidence.

The database artifact must come from PostgreSQL directly rather than through
the application pool. Use a consistent, provider-supported logical or physical
backup and verify its checksum before the drill. Back up the entire object
bucket, including private, public, staging, and temporarily orphaned objects;
application cleanup policy is not a backup filter.

## 3. Capture the expected privacy-safe manifests

At the coordinated recovery points, retain the detailed manifests only in the
restricted operations evidence store. Put only their aggregate counts and final
SHA-256 digests in the JSON gate input.

For PostgreSQL, record:

- exactly one `alembic_version` head;
- a sorted schema/constraint/index manifest and the sorted
  `schema.table=row_count` manifest with its aggregate row total;
- a reviewed critical-record digest covering immutable financial/audit IDs,
  states, linkage, and timestamps without emitting their values;
- sorted grant and complete RLS policy-definition manifests;
- total public-table count, PostgreSQL RLS policy count, and count of relations
  with RLS enabled;
- the database backup provider ID and artifact SHA-256.

For objects, build a sorted manifest from a one-way digest of the object key,
byte length, normalized content type, and a SHA-256 calculated from the complete
object bytes. Do not rely on ETag as a content hash because multipart copy and
encryption can change its meaning. Record only the object count, total bytes,
aggregate full-content digest, aggregate content-type digest, and backup job ID
in the gate input.

The database-reference inventory must include distinct non-null storage-backed
values from:

- `agent_applications`: `aadhaar_ref`, `aadhaar_back_ref`, `pan_ref`,
  `photo_ref`, and legacy `address_proof_ref`;
- `loan_documents`, `task_documents`, `task_feedback_media`,
  `property_submission_media`, and `property_media`: `object_key`;
- `campaign_media_assets.image_ref`, `banner_templates.image_ref`,
  `banners.image_key`, and `offers.image_key` when the value is not a bundled
  repository path;
- `banks.logo_key` when it uses the managed `public/provider-logos/` prefix.

Hash keys before retaining diagnostic lists. The gate input carries only the
distinct reference count and missing-reference count.

## 4. Restore into an isolated environment

1. Record `drill_started_at` in UTC and block every route from the recovery
   environment to production data stores and external delivery/payment systems.
2. Create fresh database and object targets. Do not reuse production volumes or
   buckets, and do not expose restored objects anonymously.
3. Recreate required PostgreSQL cluster roles before restoring grants. Database
   archives do not contain cluster roles; the exact-candidate rehearsal proved
   that a missing `api_user` causes grant restoration to fail.
4. Restore with the same supported PostgreSQL major version. Treat every restore
   warning or skipped item as a failure until reviewed and rerun cleanly.
5. Restore the coordinated object snapshot into the isolated bucket using the
   restore identity. Do not point the production API at it.
6. Record `verified_at` only after all reconciliation and security checks pass.

Destroying a drill target is a separate, explicitly targeted operation. Resolve
and verify exact target identifiers before cleanup; never use a broad recursive
delete, wildcard, global Docker prune, or unresolved environment variable.

## 5. Reconcile and verify

Recreate both manifests from the restored targets and compare them with the
expected manifests. Then:

- require the database summary and both object-manifest digests to match;
- require every database-backed object reference to exist in the restored
  bucket and require the missing-reference count to be zero;
- run the migration-head, grants, RLS policy/enablement, foreign-key, and
  application integrity checks in the isolated database;
- use synthetic accounts to exercise health, authentication denial, role and
  business-line isolation, private download authorization, and public-only asset
  visibility; do not send notifications or initiate payouts;
- inspect logs and the generated JSON for customer values, credentials, object
  keys, or other sensitive material before retaining it.

Copy
[`recovery-evidence.example.json`](recovery-evidence.example.json) to a location
outside the repository, replace every placeholder from reviewed provider and
drill evidence, obtain the expected candidate SHA and Alembic head independently
from the frozen release record and source tree, and run:

```bash
python scripts/check_recovery_evidence.py \
  --expected-candidate-sha "$RELEASE_CANDIDATE_SHA" \
  --expected-alembic-head "$EXPECTED_ALEMBIC_HEAD" \
  /outside-repository/recovery-evidence.json
```

Exit `0` and `"status": "PASS"` are both required. Exit `1` means a valid
record did not satisfy the gate. Exit `2` means the input could not be safely
parsed. The assessor reports the validated non-sensitive drill/candidate
identity, stable failure codes, and calculated RPO/RTO/skew. A passing result
also reports a SHA-256 binding the complete evidence record; rejected records
do not receive a digest. The assessor never echoes provider IDs or unknown
values.

## 6. Retain evidence and close the drill

- Store the approved recovery-policy ID, database/object job IDs, checksums,
  detailed manifests, restore logs, protection-control and access-audit events,
  reconciliation report, screenshots, and reviewer identity in the approved
  restricted evidence system, not Git.
- Record only the candidate SHA, drill ID, achieved RPO/RTO/skew, aggregate
  counts/digests, durable evidence IDs, named decision, and date in the release
  record.
- Revoke temporary restore access and verify revocation in the audit log.
- Remove only the exact isolated drill resources after evidence retention is
  independently confirmed.
- Keep the release `NO-GO` until the named owner verifies the evidence and all
  other launch gates are closed.
