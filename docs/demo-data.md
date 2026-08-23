# Local demo data

The comprehensive demo dataset populates the implemented Admin, Sub Admin,
Client, Agent, Telecaller, and Employee workspaces with deterministic synthetic
records. It is a public development fixture, not a production bootstrap.

Run it from the repository root with the local Docker stack healthy:

```bash
docker compose exec -T api uv run python -m app.scripts.seed_demo --verify
```

The command is idempotent. It reconciles the fixed demo accounts, inserts only
missing rows from its UUID namespace, creates three synthetic media examples
through the existing local managed-upload paths, and then verifies every login
and primary role API. It refuses to run unless `ENV=development`.

Use `--credentials` to print the roster without writing data, or `--skip-media`
when intentionally running without MinIO/ClamAV. A media skip is not proof that
upload-backed UI works.

## Credentials

Login: <http://localhost:3000/login>

| Workspace | Mobile | Password | Scope |
| --- | --- | --- | --- |
| Admin | `+919000001001` | `Demo@1234` | Platform |
| Admin (checker) | `+919000001002` | `Demo@1234` | Platform |
| Sub Admin | `+919000001003` | `Demo@1234` | Platform + payout-request preparation |
| Client | `+919000001004` | `Demo@1234` | Loans + Real Estate |
| Client (referred journey) | `+919000001005` | `Demo@1234` | Loans + Real Estate |
| Agent | `+919000001006` | `Demo@1234` | Loans |
| Agent | `+919000001007` | `Demo@1234` | Real Estate |
| Telecaller | `+919000001008` | `Demo@1234` | Loans |
| Telecaller | `+919000001009` | `Demo@1234` | Real Estate |
| Employee | `+919000001010` | `Demo@1234` | Loans |
| Employee | `+919000001011` | `Demo@1234` | Real Estate |

The first Admin becomes Main Admin only when the database has no existing Main
Admin. On an established local volume, the seeder preserves the existing Main
Admin and creates both demo Admins as ordinary platform Admins. This avoids
silently reassigning an unrelated account; use a deliberately fresh local
database when testing Main-Admin-only provisioning controls.

## Populated journeys

The dataset includes representative records for:

- assigned and due leads on both lines, Agent-introduced leads, Telecaller call
  activity, and converted/closed history;
- active, closed, and new loan applications, one transaction-history entry,
  and a sanitized synthetic salary-slip PDF;
- approved catalogue properties, Agent/Sub Admin submissions in pending,
  approved, and rejected states, bookmarks, enquiries, site visits, deals, and
  an assigned vehicle pickup;
- Employee document-collection, background-check, overdue, and property-visit
  tasks, including a confirmed synthetic task PDF and sanitized visit photo;
- pending/paid payouts, fee cashbacks, Agent commissions, referral rules,
  pending/paid referrals, and recipient transaction ledgers without calling a
  payment provider;
- live/pending banners, active/draft offers, published/draft content, support
  tickets, agent applications, per-role notifications, and audit examples.

Existing migration-owned Financial Product forms and configured providers are
reused. The seeder deliberately does not invent lender identities or logos,
create fake KYC references, call email/voice/push/payment providers, or weaken
authorization/RLS. Those boundaries need their real UI flows or separately
approved source material.

## Reruns and local state

Rerunning is safe and refreshes the known password for the fixed demo accounts.
It does not delete unrelated data or clean a test-polluted database. The command
stops on any collision where a demo mobile, email, or deterministic UUID belongs
to another account rather than taking that identity over.

The output from `--verify` is the authoritative quick check: all eleven accounts
must report a successful login and their expected role. A skipped or failed
verification is not a passing demo-data setup.
