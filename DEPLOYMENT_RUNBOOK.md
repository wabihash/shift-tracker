# Shift Tracker — Production Deployment Runbook

This checklist launches the FastAPI time engine against Neon PostgreSQL and the React 19 SPA on Vercel. Complete the steps in order. Do not skip Clerk origin allowlists or CORS; the API will return 401/CORS errors if those are wrong.

## Architecture

| Layer | Runtime | Host |
| --- | --- | --- |
| API | FastAPI (`app.main:app`), Alembic, Clerk JWKS | Render or Railway (Docker or native Python) |
| Database | PostgreSQL 16 | Neon (pooled connection string, `sslmode=require`) |
| Web | Vite + React 19 | Vercel |
| Auth | Clerk | Clerk Dashboard (production instance) |

Repository layout used by this runbook:

- Backend working directory: `backend/`
- Frontend working directory: `frontend/`
- Schema source of truth: `backend/alembic/versions/` (revision `3ffa391cd88b`, `create_initial_shift_schema`)

Required environment variables:

| Name | Where | Purpose |
| --- | --- | --- |
| `APP_ENV` | Backend | Set to `production` so workers do not run `create_all()` at startup; Alembic owns production schema changes. |
| `DATABASE_URL` | Backend | Neon URI. `app.db` rewrites `postgres://` to `postgresql://`. Must include `sslmode=require`. |
| `CLERK_ISSUER` | Backend | Issuer from Clerk JWT, no trailing slash. Example shape: `https://<instance>.clerk.accounts.dev` |
| `CORS_ORIGINS` | Backend | Comma-separated browser origins. Include the Vercel production URL and `http://localhost:5173`. |
| `VITE_API_BASE_URL` | Frontend (build-time) | Public HTTPS origin of the API, no trailing slash. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Frontend (build-time) | Clerk publishable key (`pk_live_...` or `pk_test_...`). |

Never commit live database passwords. Rotate any credential that has been stored in git history.

---

## Step 1 — Push the database schema to Neon

1. Create a Neon project in the region closest to the API (for Render Oregon, prefer `us-west` or `us-east` based on latency). Enable the connection pooler.
2. Copy the **pooled** connection string from Neon. It must look like:

   `postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/neondb?sslmode=require`

3. From a trusted machine (not a public CI log), set the URL and apply Alembic:

```bash
cd backend
export DATABASE_URL='postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/neondb?sslmode=require'
export CLERK_ISSUER='https://<instance>.clerk.accounts.dev'
python -m pip install --no-cache-dir -r requirements.txt
alembic current
alembic upgrade head
alembic current
```

4. Confirm `alembic current` prints `3ffa391cd88b (head)` (or a later head if new revisions exist).
5. Optional verification in the Neon SQL editor:

```sql
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY 1;
```

Expected application tables: `alembic_version`, `user_profiles`, `shift_rules`, `activities`, `planned_shifts`, `session_logs`, `day_overrides`.

The Render/Railway **build** command also runs `alembic upgrade head`. Running it once locally proves the URI, SSL, and migrations before the first deploy.

---

## Step 2 — Deploy the backend (Render or Railway)

### 2A. Render (native Python, recommended for this repo)

1. In Render, create a Blueprint from this GitHub repository **or** a Web Service with:
   - **Root Directory:** `backend`
   - **Runtime:** Python 3.12
   - **Build command:** `pip install --no-cache-dir -r requirements.txt && alembic upgrade head`
   - **Start command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Health check path:** `/health/ready` (database and Clerk readiness)
2. Set `APP_ENV=production` and the environment variables (Dashboard → Environment). Mark secrets as secret:

   | Key | Example value |
   | --- | --- |
   | `DATABASE_URL` | Neon pooled URI with `sslmode=require` |
   | `CLERK_ISSUER` | `https://<instance>.clerk.accounts.dev` |
   | `CORS_ORIGINS` | `https://shift-tracker.vercel.app,http://localhost:5173` |

   Update `CORS_ORIGINS` again after Vercel assigns the production hostname.

3. Deploy. Copy the public API origin, for example `https://shift-tracker-api.onrender.com` (no trailing slash).
4. Docker alternative on Render: Dockerfile path `backend/Dockerfile`, context `backend`. The image listens on port `8000` with two Uvicorn workers. Map Render’s service port to `8000` if the platform requires an explicit port.

### 2B. Railway

1. New project → Deploy from GitHub → set **Root Directory** to `backend`.
2. Railway will use `backend/Procfile`:
   - Release: `alembic upgrade head`
   - Web: `uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}`
3. Or deploy `backend/Dockerfile` (port 8000, `--workers 2`).
4. Set the same three environment variables as Render: `DATABASE_URL`, `CLERK_ISSUER`, `CORS_ORIGINS`.
5. Generate a public HTTP domain and record the origin for the frontend.

### 2C. Backend smoke after deploy

```bash
API='https://shift-tracker-api.onrender.com'
curl -sS -D - "$API/health" -o -
```

Expect HTTP 200 and `{"status":"healthy"}`.

---

## Step 3 — Deploy the frontend to Vercel

Vite inlines `VITE_*` variables at **build** time. Changing them requires a rebuild.

1. In Vercel, import the GitHub repository.
2. Configure the project:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm ci` (or `npm install` if `package-lock.json` is not committed yet)
3. Environment variables (Production, and Preview if you test preview URLs):

   | Key | Example value |
   | --- | --- |
   | `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_...` or `pk_test_...` |
   | `VITE_API_BASE_URL` | `https://shift-tracker-api.onrender.com` |

4. Deploy. Record the production origin, for example `https://shift-tracker.vercel.app`.
5. Return to the backend host and set:

   `CORS_ORIGINS=https://shift-tracker.vercel.app,http://localhost:5173`

   Redeploy the API if CORS was wrong on the first boot.

`frontend/vercel.json` already:

- Rewrites non-asset paths to `/index.html` so calendar/dashboard deep links do not 404 on refresh.
- Sends `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, HSTS, Referrer-Policy, Permissions-Policy, and a Clerk-compatible CSP.

If Clerk widgets are blocked, open DevTools → Console, note the CSP violation, and extend `connect-src` / `script-src` / `frame-src` in `frontend/vercel.json` for that Clerk Frontend API host, then redeploy.

---

## Step 4 — Clerk production domains

In the Clerk Dashboard, open the instance that matches `CLERK_ISSUER` and `VITE_CLERK_PUBLISHABLE_KEY`.

1. **Allowed origins** (or CORS / satellite domains, depending on Clerk UI version):
   - `http://localhost:5173`
   - `https://shift-tracker.vercel.app`
   - any custom domain, `https://app.example.com`
2. **Allowed redirect URLs** (sign-in, sign-up, after-auth):
   - `http://localhost:5173`
   - `http://localhost:5173/*`
   - `https://shift-tracker.vercel.app`
   - `https://shift-tracker.vercel.app/*`
3. **Home URL** / **Sign-in URL**: the Vercel production origin.
4. Confirm **Authorized parties** / JWT issuer:
   - Backend `CLERK_ISSUER` must equal the JWT `iss` claim (no trailing slash).
   - Frontend publishable key must belong to the same instance.
5. For production traffic, use a production Clerk instance and `pk_live_` keys. Keep `pk_test_` only for staging.

Wait a minute after saving allowlists so Clerk edge config can propagate.

---

## Step 5 — Live smoke tests

Replace `API` and `ORIGIN` with the deployed hosts. Use a real Clerk session token for authenticated routes (browser DevTools → Application → Clerk session, or Network request `Authorization` header).

### 5.1 Health (no auth)

```bash
API='https://shift-tracker-api.onrender.com'
curl -sS "$API/health"
```

Pass: `{"status":"healthy"}`.

### 5.2 Unauthenticated API guard

```bash
curl -sS -o /tmp/profile.json -w "%{http_code}\n" "$API/api/profile"
```

Pass: HTTP `401` and a JSON `detail` about the missing/invalid bearer token.

### 5.3 Authenticated profile bootstrap

```bash
TOKEN='<clerk_session_jwt>'
curl -sS -H "Authorization: Bearer $TOKEN" "$API/api/profile"
```

Pass: HTTP 200 JSON with `clerk_user_id`, `wake_time`, `bedtime_limit`, `weekly_target_hours`, and four `shift_rules` (created on first login).

### 5.4 Weekly analytics

Use the current ISO week (Monday–Sunday) in `YYYY-MM-DD`:

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/api/analytics/weekly?week_start=2026-09-28&week_end=2026-10-04"
```

Pass: HTTP 200 JSON with `weekly_target_hours`, `activities`, `cap_alerts`, and `lost_minutes`.

### 5.5 Browser path

1. Open the Vercel origin over HTTPS.
2. Sign in with Clerk.
3. Confirm the network tab: API calls go to `VITE_API_BASE_URL` with `Authorization: Bearer ...`.
4. Reload `/` (and any client route) and confirm Vercel serves the SPA instead of a 404.
5. Create an activity, start/stop a session, and confirm the analytics dashboard updates.

### 5.6 CORS failure signature

If the browser shows `No 'Access-Control-Allow-Origin' header`, `CORS_ORIGINS` does not include the exact Vercel origin (scheme + host, no trailing slash). Fix the backend env and redeploy.

If Clerk rejects the JWT, the API returns 401 `Invalid or expired token`. Recheck `CLERK_ISSUER` against the token `iss` claim.

---

## Operations notes

- **Migrations:** Always run `alembic upgrade head` on release (Render build command and Railway `release` process). Do not rely only on `init_db()` / `create_all` in production.
- **Pooling:** Prefer Neon’s **pooler** host for the web dyno. Direct (non-pooler) hosts are for migrations if the pooler rejects them; try pooler first.
- **Workers:** The Docker image runs `--workers 2`. Native Render/Railway start commands use a single worker unless you add `--workers` yourself; keep worker count within the plan’s RAM.
- **Secrets:** Rotate `DATABASE_URL` in Neon and the host dashboard together. After rotation, redeploy so Alembic and Uvicorn pick up the new URI.
- **Rollback:** `cd backend && alembic downgrade -1` against the same `DATABASE_URL`, then redeploy the previous Git SHA.

## Launch sign-off

- [ ] Neon schema at Alembic head; six application tables present
- [ ] API `/health` is 200 on the public HTTPS origin
- [ ] `DATABASE_URL`, `CLERK_ISSUER`, `CORS_ORIGINS` set on the API host
- [ ] Vercel build has `VITE_API_BASE_URL` and `VITE_CLERK_PUBLISHABLE_KEY`
- [ ] Clerk allowlists include localhost and the Vercel origin
- [ ] `/api/profile` is 401 without a token and 200 with a live Clerk JWT
- [ ] `/api/analytics/weekly` returns 200 for a signed-in user
- [ ] SPA reload does not 404


