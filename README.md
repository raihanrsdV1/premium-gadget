# Premium Gadget

E-commerce platform for **Premium Gadget** (Shop 451, Level 4, Sanmar Ocean City, Chattogram): new and used laptops, gadgets and repair services for the Bangladesh market.

| App | Path | Stack | Runs where |
|---|---|---|---|
| API | `backend/` | Node 24, Express, PostgreSQL 16, Zod, Jest | DigitalOcean droplet (Docker Compose + Caddy HTTPS) |
| Storefront | `storefront/` | Next.js 15 (App Router), React 19, Tailwind 4 | Vercel |
| Admin | `frontend/` | React 19, Vite, Tailwind 4, RTK Query | Locally on the shop's computer(s), not public |

Payments: SSLCommerz (cards, bKash, Nagad) + cash on delivery. Images: Cloudflare R2.

## Quick start (local)

```bash
cp .env.example .env          # dev values are fine locally
docker compose up --build     # Postgres + API (migrations + demo seed) + admin app
cd storefront && npm install && npm run dev
```

- API: http://localhost:5001/api/v1 (health: `/health`)
- Storefront: http://localhost:3000
- Admin: http://localhost:5173 (the demo logins are printed by the seed in the API logs)

## Backend tests

The integration tests run against a real Postgres:

```bash
docker run -d --name pg_premium_gadget_test -e POSTGRES_PASSWORD=test \
  -p 127.0.0.1:55432:5432 --tmpfs /var/lib/postgresql/data postgres:16-alpine
cd backend && npm ci && npm test
```

CI runs the same suite on every push and PR, and deploys `main` only when it passes.

## Docs

- [DEPLOY.md](DEPLOY.md): production setup, secrets, R2, backups, go-live checklist
- `backend/src/db/migrations/`: the database schema (migrations are the only source of schema)

## License

Private — © Premium Gadget
