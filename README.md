# Workforce Management System (WMS)

A multi-tenant workforce management platform: onboard employees across multiple
office centers, define reporting hierarchies, track task backlogs and ongoing
work, and auto-generate weekly/monthly performance reports.

## Tech stack

- **Frontend**: React (Vite) + TypeScript + Tailwind CSS + React Query + React Router + @dnd-kit + Recharts
- **Backend**: Node.js + Fastify + TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: JWT access/refresh tokens, bcrypt password hashing, RBAC middleware
- **Background jobs**: node-cron (reminders, weekly/monthly report generation)
- **File storage**: local disk in development (S3-compatible interface can be swapped in for production)
- **Notifications**: in-app feed (polling) + email delivery stubbed to console logging in dev

## Architecture

```
                        ┌─────────────────────────┐
                        │   React SPA (Vite)      │
                        │  /src/pages, components │
                        └───────────┬─────────────┘
                                    │ REST (JWT bearer)
                                    ▼
                        ┌─────────────────────────┐
                        │   Fastify API (/api)    │
                        │  auth · rbac middleware │
                        │  modules/*  (routes →   │
                        │  services → prisma)     │
                        ├─────────────────────────┤
                        │  node-cron jobs:        │
                        │  - reminder scan        │
                        │  - weekly report gen    │
                        │  - monthly report gen   │
                        └───────────┬─────────────┘
                                    │ Prisma Client
                                    ▼
                        ┌─────────────────────────┐
                        │   PostgreSQL            │
                        │  Organization-scoped    │
                        │  tables (multi-tenant)  │
                        └─────────────────────────┘
```

Every table carries (directly or transitively) an `organizationId`. All
requests are authenticated via JWT, and the authenticated user's
`organizationId` — never a client-supplied value — is used to scope every
query. Role/scope resolution (`src/lib/scope.ts`, `src/lib/hierarchy.ts`)
computes which user ids an actor can see (self / downline / center / org-wide)
and that scope is applied uniformly across tasks, the overview dashboard, and
weekly/monthly reports — all three reuse the same aggregation function
(`src/modules/overview/overview.service.ts#getOverview`), parameterized by
`(organizationId, scopeFilter, startDate, endDate)`.

## Project layout

```
backend/
  prisma/schema.prisma       full data model (see spec)
  prisma/seed.ts             demo data: 1 org, 2 centers, 3-level hierarchy, 15 users, ~64 tasks
  src/modules/<feature>/     routes + services + zod schemas, one folder per feature
  src/lib/                   hierarchy traversal, scope resolution, dates, tokens, notify
  src/jobs/                  cron: reminders, weekly/monthly report generation
frontend/
  src/pages/                 one file per route
  src/components/            Kanban board, task detail drawer, org chart, date range picker, etc.
  src/context/AuthContext    JWT session + refresh handling
```

## Getting started (local dev)

### Prerequisites

- Node.js 20+
- PostgreSQL 16 (either via `docker-compose up postgres` or a local install)

### 1. Install dependencies

```bash
npm install --workspaces=false
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
# edit DATABASE_URL to point at your Postgres instance
```

### 3. Run migrations and seed demo data

```bash
cd backend
npx prisma migrate dev
npx tsx prisma/seed.ts
```

This creates the organization **Acme Analytics** with 2 centers (Noida,
Gurgaon), 3 departments, a 3-level reporting hierarchy (15 users), and ~64
tasks (including subtasks and ongoing/recurring tasks). All seeded users
share the password `password123`. Try:

- `alice@acme.test` — OWNER
- `bob@acme.test` / `carol@acme.test` / `dave@acme.test` — MANAGER (center heads)
- `eve@acme.test` and others — EMPLOYEE

### 4. Run the app

```bash
# terminal 1
cd backend && npm run dev        # http://localhost:4000

# terminal 2
cd frontend && npm run dev       # http://localhost:5173 (proxies /api to :4000)
```

### 5. Run tests

```bash
cd backend && npm test           # hierarchy cycle-prevention + overview aggregation unit tests
```

## Environment variables (backend/.env)

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | JWT signing secrets |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL` | Token lifetimes (e.g. `15m`, `7d`) |
| `PORT` | API port (default 4000) |
| `UPLOAD_DIR` | Local disk path for task attachments |
| `MAX_UPLOAD_MB` | Per-file upload size limit |
| `CORS_ORIGIN` | Allowed frontend origin |
| `REMINDER_SCAN_CRON` | Cron expression for the reminder scan job |
| `WEEKLY_REPORT_DEADLINE_CRON` | Cron expression for the weekly-report-due reminder |

## Docker

```bash
docker compose up --build
```

Brings up Postgres, the API (`:4000`), and the built frontend served via
Nginx (`:5173`), wired together with the env vars in `docker-compose.yml`.

## Feature coverage

Implemented: multi-tenant auth & invites, RBAC, centers, departments,
hierarchy (tree view, cycle-prevention, CSV bulk import, downline/chain
queries), full task management (backlog/kanban/ongoing views, subtasks,
comment+status-change activity log, time logging, file attachments),
the flexible-time-span overview dashboard, in-app + email-stub notifications
with per-type/channel preferences and cron-driven reminders, weekly report
generation/submission/review, monthly report generation with team rollups,
an audit log for role/manager/task reassignment, and a seed script + unit
tests for the highest-risk logic (cycle prevention, aggregation math).

Not yet implemented (natural follow-ups): PDF/CSV export of
reports/dashboard snapshots, TOTP 2FA, WebSocket push for notifications
(currently polled), and a production S3/SES integration (the code is
structured so swapping the local-disk/console-log stubs for real providers
is a small, isolated change).
