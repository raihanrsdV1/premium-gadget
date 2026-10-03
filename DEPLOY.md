# Deployment & CI/CD

## Architecture

| Piece | Where | How it deploys |
|---|---|---|
| **API + Postgres** | DigitalOcean droplet, Docker Compose (`docker-compose.yml`) | Push to `main`, GitHub Actions runs the tests, then SSH → `deploy/deploy.sh` |
| **HTTPS** | Caddy container on the droplet (automatic Let's Encrypt for `API_DOMAIN`) | Part of the compose stack |
| **Storefront** (Next.js, `storefront/`) | Vercel | Vercel git integration, Root Directory = `storefront` |
| **Product images** | Cloudflare R2 (public bucket) | Uploaded through the API (`POST /api/v1/uploads/images`) |
| **Admin app** (Vite, `frontend/`) | The shop's own computer(s), never public | Local build (see `frontend/README.md`) |

```
push to main ─┬─► GitHub Actions: npm test (real Postgres) ──pass──► SSH ► deploy.sh
              │                                                     (build → backup → migrate → up)
              └─► Vercel builds storefront/
```

Internet → `https://api.<domain>` → Caddy (:443) → backend (127.0.0.1:5001) → Postgres (compose network only)

---

## One-time droplet setup

1. **Docker + Compose v2** (the DO "Docker" marketplace image has both). Open the firewall for **22, 80 and 443 only**.
2. **Deploy user** in the `docker` group: `sudo usermod -aG docker deploy`, then log out and back in.
3. **Clone** to `~/premium-gadget`. For a private repo, use a read-only deploy key.
4. **DNS**: create an `A` record `api.<domain>` → droplet IP. With Cloudflare, set it to *DNS only* (grey cloud) until Caddy has its certificate. If you later switch to the orange cloud:
   - set `TRUST_PROXY=2`
   - set `TRUSTED_PROXIES` to Cloudflare's IP ranges (https://www.cloudflare.com/ips/, space-separated); otherwise every visitor shares one rate-limit bucket
   - set SSL mode to **Full (strict)**
5. **Create `~/premium-gadget/.env`** from `.env.example`. It is never committed. Generate secrets with `openssl rand -hex 32`, and use hex for `POSTGRES_PASSWORD`. Compose refuses to start without the required values. The API also refuses placeholder or weak secrets in production, and `deploy.sh` checks them too.
   - **Payments:** `SSLCOMMERZ_IS_SANDBOX` must be set explicitly. While you test on the real server with sandbox credentials, also set `ALLOW_SANDBOX_IN_PRODUCTION=true`. **Remove it and set `SSLCOMMERZ_IS_SANDBOX=false` before real customers order**, because sandbox "payments" are fake.
6. **First deploy**: `bash deploy/deploy.sh`.
7. **Create the first admin.** No admin is seeded in production.
   ```bash
   read -s ADMIN_PASSWORD; export ADMIN_PASSWORD
   docker compose -f docker-compose.yml run --rm \
     -e ADMIN_NAME="Owner Name" -e ADMIN_PHONE=01886670543 -e ADMIN_PASSWORD \
     backend npm run create-admin
   ```
8. **Backups**:
   - Enable **DigitalOcean droplet backups**.
   - Add the nightly dump cron below. It also copies to R2 when `R2_BACKUP_BUCKET` is set.
     ```
     0 21 * * * cd ~/premium-gadget && bash deploy/backup.sh >> ~/backups/backup.log 2>&1
     ```
   - Test a restore once (instructions are at the top of `deploy/backup.sh`).

### Optional: preview with demo data
To see the storefront filled with a realistic demo catalog **before** entering real products:
```bash
docker compose -f docker-compose.yml run --rm backend npm run seed -- --allow-production
```
This adds the catalog, branch and repair price list only: no users and no coupons. Remove the demo products from admin before launch, or start with a fresh DB.

### GitHub Actions secrets
Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `DROPLET_HOST` | droplet IP |
| `DROPLET_USER` | `deploy` |
| `DROPLET_SSH_KEY` | private key whose public half is in the deploy user's `authorized_keys` (`ssh-keygen -t ed25519 -f gh_deploy_key`) |
| `DROPLET_PORT` | `22` (optional) |

Every push or PR touching `backend/` runs the test suite. Only green pushes to `main` deploy. Manual runs are available from the Actions tab.

---

## Cloudflare R2 (images)

1. Create a bucket (e.g. `premium-gadget-media`) and enable **public access**: either the `r2.dev` subdomain or a custom domain such as `media.<domain>`. Then set `R2_PUBLIC_BASE_URL` to that URL.
2. Create an **R2 API token** with *Object Read & Write*, scoped to that bucket. Fill in `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.
3. *(Recommended)* Create a second, **private** bucket for DB backups and set `R2_BACKUP_BUCKET`.
4. If you use a custom image domain, add it to `images.remotePatterns` in `storefront/next.config.mjs`.

Uploaded images are re-encoded to WebP (EXIF/GPS stripped, max 1600 px) before they're stored.

---

## Storefront on Vercel

1. Import the repo and set **Root Directory = `storefront`**.
2. Environment variables:
   - `NEXT_PUBLIC_API_BASE_URL = https://api.<domain>/api/v1`
   - `NEXT_PUBLIC_SITE_URL = https://<domain>` (canonical URLs, sitemap, JSON-LD)
   - `INTERNAL_API_KEY =` the same value as on the droplet. It's server-only and exempts SSR from per-IP rate limits.
3. Set the function region close to the droplet (Settings → Functions).
4. Add the storefront domain(s) to `CORS_ORIGIN` on the droplet. Keep `http://localhost:5173` there too, for the local admin app.

---

## Database migrations

- `backend/src/db/migrations/*.sql` is the **only** source of schema. `000_base_schema.sql` holds the original tables.
- `npm run migrate` applies pending files in order and records them in `schema_migrations`. `deploy.sh` runs it after a pre-migration backup.
- Write plain SQL with **no `BEGIN`/`COMMIT`** (the runner wraps each file), and keep it idempotent (`IF NOT EXISTS`).
- Databases created the old way (initdb + `schema.sql`) are detected and baselined automatically.

## Manual deploy & rollback

```bash
cd ~/premium-gadget
git fetch origin main && git reset --hard origin/main
bash deploy/deploy.sh

# rollback code
git reset --hard <good-commit-sha> && bash deploy/deploy.sh
# rollback data (⚠️ overwrites the DB) — see deploy/backup.sh header
```

## Local development

```bash
cp .env.example .env              # dev values are fine locally
docker compose up --build         # postgres + API (migrate + demo seed + nodemon) + admin app
```
- API: http://localhost:5001/api/v1. Admin: http://localhost:5173. Storefront: `cd storefront && npm run dev` on :3000.
- The dev seed prints demo logins for local use only.
- Backend tests: start the throwaway test DB once, then run `npm test`:
  ```bash
  docker run -d --name pg_premium_gadget_test -e POSTGRES_PASSWORD=test \
    -p 127.0.0.1:55432:5432 --tmpfs /var/lib/postgresql/data postgres:16-alpine
  cd backend && npm test
  ```

---

## Go-live checklist

- [ ] Strong `POSTGRES_PASSWORD`, `JWT_SECRET` and `INTERNAL_API_KEY` in the droplet `.env`.
- [ ] `api.<domain>` resolves and `https://api.<domain>/api/v1/health` returns `{"status":"ok"}`.
- [ ] `CORS_ORIGIN`, `SERVER_PUBLIC_URL` and `STOREFRONT_URL` use real `https://` URLs.
- [ ] Vercel env set (`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SITE_URL`, `INTERNAL_API_KEY`).
- [ ] R2 bucket and keys set; an upload from admin shows on the storefront.
- [ ] First admin created with `create-admin`; no demo users exist.
- [ ] Staff accounts created from admin (Users → Add staff). To promote an existing customer account whose phone isn't OTP-verified, you must set a new password and give it to the person in person (this blocks number-squatting).
- [ ] Droplet backups on, nightly `backup.sh` cron, one restore tested.
- [ ] SSLCommerz live credentials + `SSLCOMMERZ_IS_SANDBOX=false`, and `ALLOW_SANDBOX_IN_PRODUCTION` removed. The callback URLs are derived from `SERVER_PUBLIC_URL`.
- [ ] Repo switched to private.
