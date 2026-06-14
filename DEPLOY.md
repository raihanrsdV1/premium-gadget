# Deployment & CI/CD

## Architecture

- **Backend + Postgres** → a single DigitalOcean droplet, via Docker Compose.
- **Storefront (Next.js)** → Vercel (separate, git-integrated).
- **Auto-deploy**: push to `main` → GitHub Actions SSHes into the droplet → syncs code → rebuilds → runs DB migrations → restarts the backend. Vercel auto-builds the storefront from the same push.

```
push to main ─┬─► GitHub Actions ──SSH──► droplet: git reset + deploy.sh (build → migrate → up)
              └─► Vercel ──────────────► builds & deploys storefront/
```

## Branch strategy (recommended)

Trunk-based, which matches "push to main = live":

- `main` is **always deployable** and auto-deploys to production.
- Do work on short-lived **feature branches** → open a PR → merge to `main`.
- Turn on branch protection for `main` (require PR + the deploy/CI to be green) once you have collaborators.
- Want a safety net later? Add a `staging` branch + a second droplet/Vercel preview and promote `staging → main`. Not needed to start.

---

## One-time droplet setup

The droplet already runs the stack; this records the full setup so it's reproducible.

1. **Docker + Compose v2** (the DO "Docker" marketplace image has them).
2. **A deploy user** (`deploy`) in the `docker` group:
   ```bash
   sudo usermod -aG docker deploy    # then log out/in
   ```
3. **Clone the repo** to `~/premium-gadget` (the workflow expects this path):
   ```bash
   cd ~ && git clone <REPO_URL> premium-gadget
   ```
   - Private repo? Give the droplet read access: add a **read-only deploy key**
     (`ssh-keygen` on the droplet → add the `.pub` as a Deploy Key in GitHub repo
     Settings), or clone over HTTPS with a PAT.
4. **Create `~/premium-gadget/.env`** (gitignored; never committed). See the env
   table below.
5. First deploy: `bash deploy/deploy.sh`.

### CI SSH key

Generate a dedicated key for GitHub Actions (no passphrase):
```bash
ssh-keygen -t ed25519 -C "gh-actions-deploy" -f gh_deploy_key
# install the PUBLIC key on the droplet for the deploy user:
ssh-copy-id -i gh_deploy_key.pub deploy@167.71.220.171
#   (or: cat gh_deploy_key.pub | ssh deploy@167.71.220.171 'cat >> ~/.ssh/authorized_keys')
```

### GitHub repo secrets

Settings → Secrets and variables → Actions → **New repository secret**:

| Secret | Value |
|---|---|
| `DROPLET_HOST` | `167.71.220.171` |
| `DROPLET_USER` | `deploy` |
| `DROPLET_SSH_KEY` | contents of the **private** `gh_deploy_key` |
| `DROPLET_PORT` | `22` (optional) |

That's it — pushes to `main` now deploy automatically. You can also trigger a deploy manually from the **Actions** tab (workflow_dispatch).

---

## The droplet `.env`

Lives at `~/premium-gadget/.env`. Compose reads it for `${VAR}` substitution.

| Var | Purpose | Example (prod) |
|---|---|---|
| `NODE_ENV` | run mode | `production` |
| `POSTGRES_USER/PASSWORD/DB` | DB creds (password set once, at first init) | strong values |
| `JWT_SECRET` | token signing (`openssl rand -hex 32`) | 64-hex |
| `JWT_EXPIRES_IN` | token lifetime | `7d` |
| `CORS_ORIGIN` | storefront origin(s), comma-separated, no trailing slash | `https://shop.example.com` |
| `SERVER_PUBLIC_URL` | **public** API base for SSLCommerz callbacks (ends with `/api/v1`) | `https://api.example.com/api/v1` |
| `STOREFRONT_URL` | post-payment redirect target | `https://shop.example.com` |
| `SSLCOMMERZ_STORE_ID/PASSWORD` | gateway creds | sandbox now |
| `SSLCOMMERZ_IS_SANDBOX` | `true` until live | `true` |

> ⚠️ **Never change `POSTGRES_PASSWORD` after the first init** — Postgres only
> reads it when the data volume is first created. Changing it later causes
> `password authentication failed`. To rotate: `ALTER USER` inside Postgres, or
> `docker compose down -v` (⚠️ deletes data) and re-init.

---

## Database migrations

Schema is two layers:
- `backend/src/db/schema.sql` — base tables, applied by Postgres **only on first
  init** of the volume.
- `backend/src/db/migrations/*.sql` — incremental changes, applied by the
  **migration runner** (`backend/scripts/migrate.js`) on every deploy.

The runner tracks applied files in a `schema_migrations` table, so each migration
runs **once**. It's invoked automatically by `deploy.sh` (before the backend
starts).

**Adding a migration** (for the ongoing work):
1. Create `backend/src/db/migrations/002_whatever.sql`.
2. Write **plain SQL, no `BEGIN`/`COMMIT`** (the runner wraps each file in a
   transaction). Prefer idempotent statements (`... IF NOT EXISTS`).
3. Commit + push to `main` → it's applied on deploy.

Run manually if needed: `docker compose -f docker-compose.yml run --rm backend npm run migrate`.

> Note: your droplet DB was first created from `schema.sql` + `seed.sql` only, so
> migration 001 (inventory_units, `reserved`, order snapshots, coupon link,
> trigram index) is **not applied yet** there. The first CI deploy (or a manual
> `deploy.sh`) applies it — required for the order/stock features to work.

---

## Manual deploy & rollback

```bash
# on the droplet
cd ~/premium-gadget
git fetch origin main && git reset --hard origin/main
bash deploy/deploy.sh

# rollback to a previous commit
git reset --hard <good-commit-sha>
bash deploy/deploy.sh
```

## Dev vs prod compose

- **Local**: `docker compose up` auto-merges `docker-compose.override.yml`
  (nodemon hot-reload + the Vite app). Unchanged from before.
- **Prod/droplet**: always `docker compose -f docker-compose.yml ...` (what
  `deploy.sh` uses) — `npm start`, no source bind-mount, Postgres on localhost
  only. Don't run a bare `docker compose up` on the droplet (it'd pull in dev
  overrides).

---

## Storefront on Vercel (free tier)

1. **Import** the repo in Vercel → set **Root Directory = `storefront`** (it's a
   monorepo; this is the key step). Framework auto-detects as Next.js.
2. **Environment variables** (Project → Settings → Environment Variables):
   - `NEXT_PUBLIC_API_BASE_URL = https://api.yourdomain.com/api/v1`
   - `NEXT_PUBLIC_SITE_URL = https://your-store.vercel.app` (used for canonical
     URLs, sitemap, JSON-LD).
3. **Deploys**: Vercel auto-builds on push — `main` → Production, other branches
   / PRs → Preview URLs (great for testing before merge).
4. **Wire CORS back to the droplet**: add the Vercel production domain (and any
   custom domain) to `CORS_ORIGIN` in the droplet `.env`, then redeploy backend.
   Preview deployments get changing subdomains — list the stable ones, or use a
   custom domain.

### ⚠️ The backend must be HTTPS
A Vercel (HTTPS) page **cannot** call `http://167.71.220.171:5001` — browsers
block mixed content. Put the droplet behind HTTPS before connecting Vercel:
- point `api.yourdomain.com` at the droplet and run **Caddy** in front of
  `:5001` (automatic TLS), **or** front it with **Cloudflare** (orange-cloud),
  **or** nginx + certbot.
Then set `SERVER_PUBLIC_URL`/`NEXT_PUBLIC_API_BASE_URL` to the `https://` API
domain.

---

## Go-live checklist

- [ ] Strong `POSTGRES_PASSWORD` + `JWT_SECRET` set in droplet `.env` (before first DB init).
- [ ] HTTPS in front of the backend (domain + TLS).
- [ ] `CORS_ORIGIN`, `SERVER_PUBLIC_URL`, `STOREFRONT_URL` set to real `https://` URLs.
- [ ] Vercel `NEXT_PUBLIC_API_BASE_URL` → the HTTPS API domain.
- [ ] SSLCommerz live creds + `SSLCOMMERZ_IS_SANDBOX=false` (when ready).
- [ ] Change seeded admin password (`01700000001 / Admin@123`) or remove seed for a clean DB.
- [ ] Remove the Postgres host port mapping entirely if no admin tools need it.
