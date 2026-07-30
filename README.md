# Inventory Management Module — Backend

Fastify + TypeScript + PostgreSQL (Prisma) + Redis, modular monolith.

## Current status: boilerplate only

This is the project skeleton from Cursor Prompt 1–2 (see
`docs/06-Cursor-Prompts-Backend.md` if you've copied it in) — folder structure,
Prisma schema, shared kernel (errors/events/logger/prisma/queue), and a stub
route per module so the app boots end-to-end. **No business logic is
implemented yet.** Every module route currently returns:

```json
{ "module": "device", "status": "not_yet_implemented", "note": "..." }
```

That's expected — business logic gets added module by module once the
SRS/flow documents are signed off, following the reference Cursor prompts.

## Prerequisites

- Node.js 20+
- Docker (for local Postgres + Redis)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and fill in real secrets
cp .env.example .env
# Generate a bcrypt hash for ADMIN_SECRET_PASSWORD_HASH:
node -e "console.log(require('bcrypt').hashSync('your-secret', 10))"

# 3. Start Postgres + Redis
npm run docker:up

# 4. Generate the Prisma client and run the initial migration
npm run prisma:generate
npm run prisma:migrate -- --name init

# 5. Seed sample data (one AppUser per role, one Client, one Device)
npm run seed

# 6. Start the dev server
npm run dev
```

The server starts on `http://localhost:4000`. Check it's alive:

```bash
curl http://localhost:4000/health
# { "status": "ok", "db": "ok", "redis": "ok" }

curl http://localhost:4000/api/v1/devices
# { "module": "device", "status": "not_yet_implemented", ... }
```

## Running tests

```bash
npm test
```

The smoke test in `tests/integration/app.smoke.test.ts` confirms the app
boots and every module stub responds — this is your regression check that
the skeleton stays intact as business logic gets layered in.

## What's NOT here yet (by design)

- RBAC permission matrix (`src/shared/kernel/rbac`) — placeholder only
- Auth (login, JWT issuance, agent API-key verification)
- Any actual create/read/update/delete logic in any module
- BullMQ workers (queue helpers exist in `shared/kernel/queue`, but nothing
  enqueues or processes jobs yet)
- Frontend integration / CORS allow-list tightening (currently `origin: true`
  for local development — lock this down before any real deployment)

## Folder structure

```
src/
├── app.ts                  # Fastify factory — plugins, DI container, module wiring
├── server.ts                # Entry point
├── config/
│   ├── env.ts                # zod-validated environment loader
│   └── container.ts          # awilix DI container (infra singletons only so far)
├── shared/
│   ├── kernel/
│   │   ├── errors/            # AppError hierarchy
│   │   ├── events/             # Domain event bus (EventEmitter2 wrapper)
│   │   ├── logger/             # Pino singleton
│   │   ├── prisma/             # PrismaClient singleton
│   │   ├── queue/              # BullMQ queue/worker factories
│   │   └── rbac/               # PLACEHOLDER — permission matrix not yet built
│   └── http/
│       ├── plugins/            # error-handler
│       └── schemas/            # shared pagination schema
├── modules/                  # one folder per domain module, all stubs for now
│   ├── auth/
│   ├── client/
│   ├── device/
│   ├── agent/
│   ├── qr/
│   ├── other-network-device/
│   ├── notification/
│   ├── audit/
│   └── user-management/
├── jobs/                     # scheduled jobs land here (lifecycle sweep, etc.)
└── types/
    └── fastify.d.ts           # request.container type augmentation

prisma/
├── schema.prisma
└── seed.ts

tests/
├── unit/
└── integration/
```

## Next step

Once the SRS/flow documents are approved, open this repo in Cursor — the
`.cursor/rules` file in this repo already carries the engineering standards
(SOLID, repository pattern, event-driven cross-module communication, etc.),
and each module's business logic can be built prompt-by-prompt from the
reference Cursor prompts document.
