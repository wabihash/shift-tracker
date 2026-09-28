# Security Audit Policy and Verification

## Scope and release gate

This document defines the security checks for the FastAPI, SQLModel, PostgreSQL, and Clerk authentication paths in this repository. Run the checks against a non-production environment before release and repeat them after changes to authentication, routers, models, SQL statements, or database configuration. Record the commit, environment, date, operator, and evidence in the release record. Never record bearer tokens, passwords, full connection URIs, or session notes in audit evidence.

A release is blocked by any cross-user data disclosure or mutation, any token accepted with an invalid signature/issuer/expiry, or any production database connection not using TLS with `sslmode=require` (or a stricter verified mode where explicitly approved).

## Tenant isolation policy

Every authenticated route obtains its tenant identity from the verified Clerk JWT subject via `get_current_user`; clients must not choose a `clerk_user_id`. Every SQLModel read, update, or delete must either:

1. include `clerk_user_id` in the SQL predicate, or
2. resolve the current user's `UserProfile` first and scope related rows through that profile's primary key, or
3. fetch a single row by ID and immediately verify its owner before returning or mutating it.

Bulk child-row deletes must include the Clerk user predicate even when the parent row was already owner-checked. Return 404 for a resource ID owned by another user so existence is not disclosed.

### Current query ownership map

| Area | Tenant boundary to verify |
| --- | --- |
| Profile | `UserProfile.clerk_user_id == clerk_user_id`; shift rules are loaded through the owned profile relationship. |
| Activities | List uses the current profile ID. Read/update/delete resolve the activity through its profile and Clerk subject. Activity deletion also scopes dependent session and planned-shift deletes by `clerk_user_id`. |
| Planned shifts | List filters by `PlannedShift.clerk_user_id`. Single-row lookup checks `shift.clerk_user_id` after lookup; create validates activity ownership and assigns the current subject. |
| Sessions | List and analytics filter `SessionLog.clerk_user_id`. Create validates activity and optional planned-shift ownership and writes the current subject from auth. |
| Analytics | Activity rows are selected through the current profile; session rows are filtered directly by the current subject and date range. |

Re-run the source inventory whenever query code changes:

```bash
rg -n "select\\(|session\\.get\\(|delete\\(" backend/app
```

For each result, trace the tenant condition through joins, the current profile lookup, or the explicit owner check. Do not treat a client-provided resource ID as proof of ownership.

### Two-user adversarial verification

Use two independent test Clerk accounts with separate profiles in staging. Create one activity, planned shift, and session under each account. With account A's token, verify its own profile, activities, planned shifts, sessions, and weekly analytics contain only A's data. Repeat as account B and verify only B's data appears.

Using account B's token, try to update and delete account A's activity and planned shift by ID, and try to create a session using A's activity or planned-shift IDs. Each attempt must return 404 and must leave A's rows unchanged. Capture status codes and row counts, never tokens or response bodies containing user data.

## Clerk JWT verification

The backend must continue to use `PyJWKClient` and its cached signing keys. Audit `backend/app/auth.py` after any auth change and confirm all of the following remain true:

- `jwt.decode` allows only `RS256`; do not derive the algorithm from the token header.
- The signing key is selected from the configured Clerk JWKS using the JWT key ID.
- The decoded `iss` must equal `CLERK_ISSUER`.
- `sub`, `exp`, and `iss` are required. PyJWT expiry verification remains enabled.
- Missing credentials, bad signatures, unknown keys, expired tokens, and wrong issuers are rejected; no unsigned or local fallback identity is accepted in production.
- JWKS caching improves normal verification availability but does not bypass signature, issuer, or expiration validation. The readiness check independently verifies live JWKS reachability.

In staging, exercise one valid Clerk session and negative cases for a modified signature, expired token, wrong issuer, missing subject, and an unsupported algorithm. All negative cases must return 401. Do not paste tokens into shell command arguments or CI logs; use a protected test runner environment.

## PostgreSQL TLS verification

Neon production URLs must request TLS with `sslmode=require`. Run this non-printing check from `backend/` in the same environment used for migration and service startup:

```bash
python -c "from dotenv import load_dotenv; from sqlalchemy.engine import make_url; import os; load_dotenv(); url=make_url(os.environ['DATABASE_URL']); assert url.get_backend_name() == 'postgresql'; assert url.query.get('sslmode') == 'require'; print('PostgreSQL URL uses sslmode=require')"
```

Then confirm the hosting platform's `DATABASE_URL` is the Neon PostgreSQL URI and contains `sslmode=require`; do not print or commit the URI. Verify the live connection succeeds from the deployed service. Never downgrade production to plaintext or disable certificate verification to work around a connectivity incident.

## Secret and log handling

- Keep `.env`, Clerk session tokens, and database credentials out of source control. Rotate any value exposed in a terminal capture or repository history.
- `VITE_CLERK_PUBLISHABLE_KEY` is intended for the frontend; database credentials and private Clerk keys are never frontend variables.
- API logs may contain Clerk user IDs and request IDs, but must not contain bearer tokens, connection strings, SQL bind values, or session notes. Limit log access and retention to operational need.
- Grant database users only the permissions required by the API and migration process. Use a separate controlled migration credential if the hosting platform supports it.

## Review checklist

- [ ] Tenant predicates or owner checks cover every SQLModel query and bulk mutation.
- [ ] Cross-user read, update, delete, and relationship-ID attacks are rejected in staging.
- [ ] JWT algorithm, signature, issuer, subject, and expiry checks are intact.
- [ ] PostgreSQL TLS URL check passes for migration and runtime environments.
- [ ] No credentials or tokens appear in logs, frontend bundles, source control, or audit evidence.
- [ ] Findings have an owner and are resolved before production release.
