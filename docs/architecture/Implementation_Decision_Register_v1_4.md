# Implementation Decision Register — v1.4 Final Schema Correction

**Loans & Real Estate Platform**  
**Date:** 28 June 2026  
**Status:** Final database segregation decision for MVP development

## 1. Final decision

The MVP shall use one login identity with separate line-specific profile rows. The database shall not use `business_line = both`.

## 2. Final schema rule

| Concept | Table | Business-line rule |
|---|---|---|
| Login/mobile/password | `auth_users` | no business-line column |
| Client/customer participation | `client_profiles` | one row per line: `loans` or `real_estate` |
| Agent capability | `agent_profiles` | one row per approved line; never `both` |
| Staff/Admin capability | `staff_profiles` | Telecaller/Employee line-specific; Admin/Sub Admin platform-scoped |
| Business records | leads, applications, inquiries, tasks, transactions, banners, reports | exactly one immutable `business_line`: `loans` or `real_estate` |

## 3. Client using Loans and Real Estate

When a customer selects both products, the system creates:

```text
auth_users
  └── client_profiles: loans
  └── client_profiles: real_estate
```

The customer still logs in with one mobile number, but Admin can report Loan users and Real Estate users separately from `client_profiles`.

## 4. Reporting impact

Loan user report:

```sql
SELECT *
FROM client_profiles
WHERE business_line = 'loans';
```

Real Estate user report:

```sql
SELECT *
FROM client_profiles
WHERE business_line = 'real_estate';
```

Customers using both:

```sql
SELECT auth_user_uuid
FROM client_profiles
GROUP BY auth_user_uuid
HAVING COUNT(DISTINCT business_line) = 2;
```

## 5. Locked related decisions

- Agent-introduced leads do not auto-expire to an open pool.
- Admin creates Employee tasks for MVP.
- Employee collects documents; Admin verifies completeness; bank verifies final loan acceptance/sanction.
- Admin executes referral payouts.
- Client → Agent conversion creates an `agent_profiles` row and does not rewrite the client profile/customer ID.
- This full scope remains the MVP, but delivery can still be phased internally.
