# Inventory Management Module — Backend

Fastify + TypeScript + PostgreSQL (Prisma) + Redis/BullMQ, modular monolith.

## Current status: business modules implemented

Auth, RBAC, Clients, Devices (allotment/lifecycle/history), Agents, QR, Other
Network Devices, Notifications (async email), Audit (immutable trail with
field-level diffs), and a daily lifecycle sweep job are implemented. OpenAPI
UI lives at `/docs`.

## Prerequisites

- Node.js 20+
- Docker (for local Postgres + Redis)

## Setup

```bash
npm install
cp .env.example .env
# Generate ADMIN_SECRET_PASSWORD_HASH:
node -e "console.log(require('bcrypt').hashSync('your-secret', 10))"

npm run docker:up
npm run prisma:generate
npm run prisma:migrate:deploy   # or: npm run prisma:migrate
npm run seed
npm run dev
```

Server: `http://localhost:4000`

```bash
curl http://localhost:4000/health
# { "status":"ok","db":"ok","redis":"ok","docs":"/docs", ... }

open http://localhost:4000/docs
```

Seed password for all AppUsers: `Password123!`  
Seed agent API key (device `DEL-LN-00101`): `seed-agent-delhi-key`

## Running tests

```bash
npm test
```

Integration suites skip gracefully when `postgres-test` (port 5433) is down.

## What's built

| Area | Status |
|------|--------|
| RBAC permission matrix + hooks | Done |
| Auth (JWT login + agent API key) | Done |
| Client CRUD / location / engineer assign | Done |
| Device allotment, PATCH, assignments, lifecycle | Done |
| Agent poll / download token / deregister | Done |
| QR generate (1:1), image, resolve, run-poll | Done |
| Other Network Devices + link to Device | Done |
| Notifications (queue + nodemailer worker) | Done |
| Audit (every mutation → AuditLog + fieldChanges) | Done |
| Lifecycle sweep job (warn + hard-delete) | Done |
| OpenAPI (`/docs`) from zod schemas | Done |

## What's NOT here yet

- Frontend integration / CORS allow-list tightening (currently `origin: true`
  for local development — lock this down before any real deployment)
- Production SMTP credentials (leave `SMTP_HOST` empty for dry-run skips)
- Multi-tenant SaaS isolation beyond Client scoping

## Folder structure

```
src/
├── app.ts / server.ts
├── config/          # env + awilix container
├── shared/kernel/   # errors, events, prisma, queue, rbac, logger
├── shared/http/     # error-handler, swagger, pagination
├── modules/         # auth, client, device, agent, qr, ond, notification, audit, user-management
├── jobs/            # BullMQ wiring (lifecycle-sweep)
└── types/
prisma/              # schema, migrations, seed.ts
tests/               # unit + integration
docs/                # SYSTEM-OVERVIEW.md + SYSTEM-OVERVIEW.html + postman collection
```

## Docs & Postman

- **`docs/SYSTEM-OVERVIEW.md`** — full tutorial + every API (roles, body, real JSON responses, audit fieldChanges)
- **`docs/SYSTEM-OVERVIEW.html`** — same content, open in a browser (start at section “How to use this document”)
- **`docs/postman/Inventory-Backend.postman_collection.json`** — import into Postman

First-time path: open the HTML → follow walkthrough steps 1–15 → use Postman or curl for each call.
