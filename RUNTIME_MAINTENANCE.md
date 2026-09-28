# Runtime Maintenance and Incident Guide

This guide covers routine operation of the Shift Tracker API, Neon PostgreSQL, Clerk authentication, and database backups. Keep production credentials in the hosting platform or an operator secret manager. Do not put connection strings, Clerk tokens, or backup credentials in source control or shell history.

## Health and request observability

- `GET /health` is a process/liveness check. It does not prove the database or Clerk is available.
- `GET /health/ready` is a dependency/readiness check. It executes `SELECT 1` against the configured database and fetches the configured Clerk JWKS document with a three-second timeout. It returns HTTP 200 only when both dependencies respond and the JWKS contains keys; otherwise it returns HTTP 503 with each dependency status.
- Each HTTP response includes `X-Request-ID`. The API emits one JSON access log per request with UTC timestamp, level, request ID, authenticated Clerk user ID when available, method, path, status, and response latency. Requests above 800 ms are warnings.
- SQLAlchemy queries above 800 ms also produce warning logs with request ID, user ID, endpoint path, query type, and query duration. Bound parameter values and SQL text are intentionally excluded from logs.
- Use the response `X-Request-ID` to find the matching API log. Unauthenticated requests have a null `user_id` by design.

## Neon connection pool sizing

The backend currently uses SQLAlchemy's default QueuePool: up to five pooled connections plus ten overflow connections per process. PostgreSQL connection establishment and pool acquisition each time out after five seconds. With the production Docker configuration's two Uvicorn workers, the API can therefore open up to 30 database connections during bursts. Render/Railway native configurations run one worker unless configured otherwise. Pool limits multiply by process count; include schedulers, migration commands, and operator sessions in the total.

Neon connection limits vary by plan and compute configuration. Check current project limits and active connection metrics in the Neon console before changing worker or pool counts. Prefer Neon's pooled connection URI for web workers. Leave headroom for migrations and administration; do not size the API to consume the full database connection allowance.

For a service expected to sustain W worker processes, with per-process pool size P and overflow O, its maximum client connections are W * (P + O). Keep O small and finite. For example, two workers with P=3 and O=1 can open at most eight API connections. Configure pool_size, max_overflow, and pool_timeout on the SQLAlchemy engine if this bound is needed; do not assume Neon's pooler removes the need to bound application clients. The current five-second pool timeout returns load promptly instead of allowing requests to queue without limit.

When the database reports connection saturation, first stop increasing worker counts and inspect active sessions and pooler metrics. Reduce application concurrency or pool overflow if API demand exceeds the available Neon capacity. Keep a separate connection allowance for schema migrations and incident response.

## Backup and restore operations

The scripts require PostgreSQL client tools (`pg_dump` and `pg_restore`) and Bash. The backup script writes UTC timestamped custom-format dumps under `backups/` by default and removes matching dump files older than 14 days. Set `BACKUP_DIR` to an encrypted, durable operations volume when available; the default repository workspace may be ephemeral on a hosted service. Run backups from a trusted operator host or scheduled runner with network access to Neon.

```bash
bash scripts/db_backup.sh
```

`DATABASE_URL` must already be present in the process environment. The script uses `umask 077`, restricts the backup directory to the current operator, checks that the dump is non-empty, and does not print the URI. Copy completed dumps to durable off-host storage and apply that storage's encryption and access controls. Keep retention aligned with the organization's approved data-retention policy; the local script's 14-day purge is not the complete off-site retention policy.

Restore replaces matching objects in the target database. First create a fresh backup of the target, stop application writes or put the service in maintenance mode, and verify the source dump. Run interactively; the command prompts for the exact word `RESTORE`:

```bash
BACKUP_FILE="$(ls -1t backups/backup_*.dump | head -n 1)"
bash scripts/db_restore.sh "$BACKUP_FILE" "$TARGET_DATABASE_URL"
```

Set `TARGET_DATABASE_URL` from the operator secret manager before running this command. Do not restore into a production branch until the target identity has been checked independently. After restore, run `alembic current`, call `/health/ready`, and verify representative profiles, activities, sessions, and analytics before reopening writes. Periodically restore a backup into a disposable Neon branch to prove that backups are usable.

## Schema rollback

Prefer a forward migration that repairs the issue when it is safe to do so. If rollback is required, first stop writes, take a fresh database backup, review the target revision's `downgrade()` implementation, and confirm that its data loss is acceptable. From the backend directory with the production `DATABASE_URL` loaded:

```bash
alembic current
alembic downgrade -1
alembic current
```

`alembic downgrade -1` moves the schema back one revision; it does not restore deleted or transformed data. Do not run it as an automatic response to an application rollback. Re-deploy a compatible application version, verify readiness and core user flows, then resume writes. If the downgrade is destructive or not implemented, restore to a separate branch and perform a reviewed recovery instead.

## Session log retention

`session_logs` contains user-linked work history, timestamps, notes, and analytics inputs. There is no application-level retention policy or archive workflow in this repository. Do not delete older `SessionLog` rows merely to reduce database size.

Before adopting a retention period, get the product and privacy owners to approve the period, user notice, deletion behavior, and backup expiry. Measure monthly row counts and storage first. If policy later requires removal, export the affected records to an access-controlled encrypted archive, verify row counts and a sample restore, then delete in bounded batches using `logged_date` and a stable key such as `id`. Run batches during low traffic, monitor Neon load, and stop if query latency or error rates increase. Preserve referential integrity and verify that reports do not silently change before deleting any history.

## Incident: Clerk JWKS timeout or authentication failures

1. Check API logs for `dependency=clerk_jwks`, `/health/ready`, and request IDs on 401/500 responses. A failed ready check means the live JWKS endpoint could not be fetched; a cached signing key may still allow some tokens to validate.
2. Verify the configured `CLERK_ISSUER` matches the token issuer and that `/.well-known/jwks.json` is reachable from the API runtime. Check Clerk status, DNS, outbound network policy, TLS errors, and timeout patterns.
3. Do not disable signature verification, issuer validation, or expiry checks. Do not accept unsigned tokens as a fallback.
4. If Clerk is healthy but this service cannot reach it, repair egress/DNS and verify the ready check returns 200. If Clerk has an outage, keep existing service behavior secure, communicate the auth impact, and retry after Clerk recovers.
5. After recovery, test a newly issued Clerk session and a protected API route. Restart workers only if a key-cache refresh is needed after connectivity has returned.

## Incident: Neon read throttling or elevated query latency

1. Correlate slow-query warnings and request latency by `request_id`, endpoint, and query type. Check `/health/ready`, Neon compute health, pooled and direct connection counts, CPU, storage, and provider-side throttling signals.
2. If readiness fails, treat the database as unavailable and avoid repeated deploys or migration attempts. If readiness passes but reads are throttled, the `SELECT 1` probe is only a shallow connectivity signal; application queries can still be degraded.
3. Reduce avoidable concurrent requests and retries. Keep pool overflow bounded, pause nonessential batch work, and avoid raising worker counts during saturation. Do not log SQL parameters or credentials while diagnosing.
4. Review the affected query plan and indexes in a safe environment. Deploy a query or index change through a reviewed Alembic migration after load stabilizes; do not run ad hoc schema changes against production.
5. Resume normal traffic gradually and confirm latency warnings decline, reads return expected data, and no writes were duplicated. Escalate persistent provider throttling with the Neon project and request IDs/time window.

## Routine cadence

- Daily: confirm the scheduled backup completed and was copied off-host.
- Weekly: inspect Neon connection headroom, slow-query warnings, and backup storage access.
- Monthly: restore a backup to a disposable branch, verify the schema revision, and record the recovery result.
- Before each migration: review upgrade and downgrade behavior, confirm a recent usable backup, and monitor the deployment through the readiness check.

