# 🛒 Premium Gadget

> Full-stack e-commerce platform for new & used laptops, accessories, and repair services — built for the Bangladesh market.

## Tech Stack

| Layer     | Technology                            |
| --------- | ------------------------------------- |
| Frontend  | React 18 · Vite · Tailwind CSS · shadcn/ui · Redux Toolkit |
| Backend   | Node.js · Express.js · Zod           |
| Database  | PostgreSQL 16                         |
| Payments  | SSL Commerz (cards, bKash, Nagad)     |
| Infra     | Docker · docker-compose               |

## Quick Start

```bash
# 1. Clone and copy env
cp .env.example .env

# 2. Start everything (Postgres + Backend + Frontend)
docker-compose up --build

# 3. Access
#    Frontend  → http://localhost:5173
#    Backend   → http://localhost:5000/api/v1
#    Postgres  → localhost:5432
```

## Project Structure

```
├── backend/          # Express.js API (domain-driven modules)
├── frontend/         # React SPA (Vite + Tailwind + shadcn/ui)
├── docker-compose.yml
└── .env.example
```

## License

Private — © Premium Gadget
