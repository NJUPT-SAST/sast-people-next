# SAST People Next

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Recruitment workflows, grading, interview review, and result notifications for **NJUPT SAST**.

SAST People focuses on the recruitment and review process. User identity, profile data, role, and account state are provided by **SAST Link**.

## Overview

| Area | Owner | Notes |
| --- | --- | --- |
| User identity and profile | SAST Link | OAuth login, profile fields, role, account state, third-party identities |
| Recruitment workflows | SAST People | Written recruitment, exemption recruitment, WOC/WOD, SOC/SOD |
| Review and grading | SAST People | QR-code grading, score aggregation, interview review, final approval |
| Result notifications | SAST People | Email templates, delivery batches, result locking |
| Business data | SAST People | Flows, registrations, scores, evaluations, email records, operation audits |

## Core Features

- Fixed workflow models for written recruitment, exemption recruitment, WOC/WOD, and SOC/SOD.
- Written exam grading with QR-code scanning, manual student ID lookup, and score aggregation.
- Pass/fail confirmation for written recruitment with result-email locking.
- Lecturer interview evaluation and administrator final approval.
- Link role synchronization from accepted workflow results.
- Link user lookup, read-only profile viewing, role editing, and account banning for workflow administration.
- Local PostgreSQL development database with seed data for repeatable demos.

## Workflow Model

| Flow type | Steps | Final role effect |
| --- | --- | --- |
| `recruitment` | Registration, grading, admission confirmation | Accepted candidates become members |
| `recruitment_exemption` | Registration, lecturer review, administrator review | Approved candidates become members |
| `woc` | Registration, lecturer review, administrator review | New students become members |
| `soc` | Registration, lecturer review, administrator review | Approved users become lecturers |

`user_flow.status` supports:

| Status | Meaning |
| --- | --- |
| `pending` | Not started |
| `ongoing` | In progress or waiting for decision |
| `passed` | Written recruitment candidate marked as passed before result email sending |
| `failed` | Written recruitment candidate marked as failed before result email sending |
| `accepted` | Final accepted status |
| `rejected` | Final rejected status |

For written recruitment, `passed` / `failed` are temporary review states. After result emails are sent, they are locked into `accepted` / `rejected`.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 App Router |
| UI | React 19, Tailwind CSS v4, shadcn/ui |
| Database | PostgreSQL, Drizzle ORM |
| Auth | Encrypted cookie sessions, SAST Link OAuth |
| Data fetching | Server Components, Server Actions, SWR |
| Email | Inngest, react-email, nodemailer |
| Testing | Jest, Testing Library |

## Quick Start

Prerequisites:

- Node.js 20+
- pnpm 8+
- PostgreSQL 14+

```bash
pnpm install
pnpm db:migrate
pnpm db:seed:local
pnpm db:seed:demo
pnpm dev
```

The default development server runs at:

```text
http://localhost:3000
```

## Local Database

For the local PostgreSQL installed on this machine:

```env
DATABASE_URL=postgres://postgres:123456@localhost:5432/sastpeople_local
LINK_ALLOW_LEGACY_FALLBACK=false
PEOPLE_ALLOW_LEGACY_AUTH=false
```

Then apply migrations and seed local data:

```bash
pnpm db:migrate
pnpm db:seed:local
pnpm db:seed:demo
```

The seeded local administrator is:

```text
student_id: 001
```

Docker PostgreSQL is also available:

```bash
pnpm db:dev:up
```

```env
DATABASE_URL=postgres://sastpeople:sast_dev_password@localhost:55432/sastpeople_local
```

SAST Link owns user identity and profile data. Configure `LINK_*` variables for the target Link environment. Use `LINK_USE_MOCK=true` only as a temporary local stub when Link is unavailable.

## Full Development Mode

```bash
pnpm dev:full
```

This starts:

- Next.js on port `3001`
- Inngest dev server
- Email preview server on port `3002`

## Environment Variables

Copy `.env.example` to `.env.local` and fill in local values:

```bash
cp .env.example .env.local
```

Keep local secrets in `.env.local`. Do not commit `.env*` files.

For production Docker deployment, runtime secrets are stored on the server at:

```text
/data/sast-people-next/.env
```

`docker-compose.yml` loads this file with `env_file`. GitHub Actions does not rewrite production runtime secrets during deployment. If a runtime secret changes, update the server file and recreate the container:

```bash
cd /data/sast-people-next
vim .env
chmod 600 .env
docker compose up -d --force-recreate
```

This does not require rebuilding or copying a new image. Build-time public variables such as `NEXT_PUBLIC_SENTRY_DSN` are still passed through GitHub Actions because Next.js inlines `NEXT_PUBLIC_*` values during `pnpm build`.

## Documentation

- [SAST People v3 Link integration plan](docs/SAST_PEOPLE_V3_LINK_DEV.md)
- [People database schema](docs/PEOPLE_DATABASE_SCHEMA.md)
- [Testing guide](TESTING.md)
- [CI/CD guide](CI_CD.md)

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the development server |
| `pnpm dev:db` | Alias for local PostgreSQL development |
| `pnpm dev:full` | Start Next.js, Inngest, and email preview |
| `pnpm db:dev:up` | Start local PostgreSQL for development |
| `pnpm db:dev:down` | Stop local PostgreSQL |
| `pnpm db:dev:logs` | Tail local PostgreSQL logs |
| `pnpm db:migrate` | Apply Drizzle migrations |
| `pnpm db:seed:local` | Seed the local administrator account |
| `pnpm db:seed:demo` | Seed local demo workflow data |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:push` | Push schema changes directly |
| `pnpm db:studio` | Open Drizzle Studio |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run all Jest tests |
| `pnpm build` | Build for production |

## Project Structure

```text
app/                    Next.js App Router pages and API routes
components/             Shared UI and feature components
components/ui/          shadcn/ui primitives
action/                 Server Actions for mutations and workflow operations
db/                     Drizzle schema and database client
docs/                   Project documentation and integration plans
hooks/                  Server and SWR data hooks
lib/                    DAL, session helpers, and shared utilities
migrations/             Drizzle SQL migrations
types/                  Shared TypeScript types
public/                 Static assets
```

## Database

The database schema is defined in `db/schema.ts`. Migrations live in `migrations/` and should remain ordered by numeric prefix.

Current core tables include:

| Table | Purpose |
| --- | --- |
| `user` | Legacy fallback and migration only |
| `flow` | Workflow definition |
| `flow_step` | Workflow steps |
| `user_flow` | User registration and workflow status |
| `problem` | Written exam problems |
| `user_point` | Grading records |
| `interview_evaluation` | Interview review and final approval |
| `email_template_setting` | Result email template settings |
| `email_batch` | Result email sending batches |
| `email_delivery` | Per-user email delivery records |
| `operation_audit` | Administrative operation audit logs |

People business tables store Link user IDs after the v3.1 migration. See [People database schema](docs/PEOPLE_DATABASE_SCHEMA.md) for details.

## Verification

Before opening a pull request or deploying, run:

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

Focused tests can be run by passing test file paths to Jest:

```bash
pnpm test -- --runInBand components/recruitment/table.test.tsx
```

## Notes

- Do not commit real `.env*` files. `.env.example` is the tracked template.
- Only expose safe client-side values through `NEXT_PUBLIC_*`.
- Use a local PostgreSQL database for local UI and workflow testing.
- Run migrations before using features that depend on new enum values such as `passed` and `failed`.

## License

SAST People Next is developed and maintained by NJUPT SAST and released under the [MIT License](LICENSE).
