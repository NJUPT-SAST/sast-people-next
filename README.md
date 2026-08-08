# SAST People Next

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Recruitment workflows, grading, interview review, interview scheduling, and result notifications for **NJUPT SAST**.

SAST People owns the recruitment and review process. User identity, profile data, role, and account state are provided by **SAST Link**.

## Overview

| Area | Owner | Notes |
| --- | --- | --- |
| User identity and profile | SAST Link | OAuth login, profile fields, role, account state, third-party identities |
| Recruitment workflows | SAST People | Written recruitment, exemption recruitment, WOC/WOD, SOC/SOD |
| Review and grading | SAST People | QR-code grading, score aggregation, interview evaluation, final approval |
| Interview scheduling | SAST People + Feishu | Calendar events, video meetings, bot cards, reminders |
| Result notifications | SAST People | Email center templates, batches, retries, rate limits, delivery audits |
| Admin operations | SAST People | User lookup, role edits, bans, operation audit, error log |
| Observability | SAST People | Sentry, health checks, server error logging |

## Core Features

- Fixed workflow models for written recruitment, exemption recruitment, WOC/WOD, and SOC/SOD.
- Written exam grading with QR-code scanning, manual student ID lookup, and score aggregation.
- Pass/fail confirmation for written recruitment with result-email locking.
- Lecturer interview evaluation and administrator final approval.
- Feishu interview scheduling: OAuth binding, calendar events, VC reservation, IM cards, and reminders.
- Result email center with templates, batches, retries, rate limiting, provider webhooks, and attempt history.
- Link role synchronization from accepted workflow results.
- Link user lookup, read-only profile viewing, role editing, and account banning for workflow administration.
- Local PostgreSQL development database with seed data for repeatable demos.
- Jest unit/integration tests and Playwright end-to-end coverage for critical admin and student paths.

## Workflow Model

| Flow type | Steps | Final role effect |
| --- | --- | --- |
| `recruitment` | Registration, grading, admission confirmation | Accepted candidates become members |
| `recruitment_exemption` | Registration, lecturer review, administrator review | Approved candidates become members |
| `woc` | Registration, lecturer review, administrator review | New students become members |
| `soc` | Registration, lecturer review, administrator review | Approved users become lecturers |

### `user_flow.progress_status`

| Status | Meaning |
| --- | --- |
| `not_started` | Registered but not actively progressing |
| `ongoing` | In progress or waiting for a decision |
| `passed` | Workflow outcome is pass / accepted |
| `failed` | Workflow outcome is fail / rejected |

This enum replaced the older `user_flow.status` values (`pending` / `accepted` / `rejected` / …). See [People database schema](docs/PEOPLE_DATABASE_SCHEMA.md) for the migration mapping.

### Related statuses

| Field | Values | Meaning |
| --- | --- | --- |
| `interview_evaluation.status` | `submitted`, `approved`, `rejected` | Lecturer submission and administrator final review |
| `email_batch.status` | `draft`, `queued`, `completed`, `failed` | Result email batch lifecycle |
| `email_delivery.status` | `pending`, `sending`, `sent`, `failed`, `dead` | Per-recipient delivery state |
| `interview_schedule.status` | `created`, `cancelled`, `failed` | Feishu interview schedule state |

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 App Router, React 19 |
| UI | Tailwind CSS v4, shadcn/ui, Framer Motion |
| Database | PostgreSQL, Drizzle ORM |
| Auth | Encrypted cookie sessions, SAST Link OAuth, optional Feishu OAuth binding |
| Data fetching | Server Components, Server Actions, SWR |
| Background jobs | Inngest |
| Email | react-email, nodemailer, Feishu SMTP |
| Integrations | Feishu / Lark Open API, SAST Link |
| Observability | Sentry |
| Testing | Jest, Testing Library, Playwright |

## Quick Start

Prerequisites:

- Node.js 20+
- pnpm 8+
- Docker (recommended for local PostgreSQL) or PostgreSQL 14+

```bash
pnpm install
cp .env.example .env.local
pnpm db:dev:up
```

Set in `.env.local`:

```env
DATABASE_URL=postgres://sastpeople:sast_dev_password@localhost:55432/sastpeople_local
SESSION_SECRET=replace-with-a-long-random-string
LINK_ALLOW_LEGACY_FALLBACK=false
PEOPLE_ALLOW_LEGACY_AUTH=false
```

Then:

```bash
pnpm db:migrate
pnpm db:seed:local
pnpm db:seed:demo
pnpm dev
```

The default development server runs at:

```text
http://localhost:3000
```

The seeded local administrator is:

```text
student_id: 001
```

## Local Database

### Docker PostgreSQL (recommended)

```bash
pnpm db:dev:up
```

```env
DATABASE_URL=postgres://sastpeople:sast_dev_password@localhost:55432/sastpeople_local
```

Stop or inspect the container:

```bash
pnpm db:dev:logs
pnpm db:dev:down
```

### Host PostgreSQL

Point `DATABASE_URL` at any local PostgreSQL instance, then run:

```bash
pnpm db:migrate
pnpm db:seed:local
pnpm db:seed:demo
```

### SAST Link

SAST Link owns user identity and profile data. Configure `LINK_*` variables for the target Link environment.

- Use `LINK_USE_MOCK=true` only as a temporary local stub when Link is unavailable.
- Do not enable `LINK_USE_MOCK=true` for production or real-user testing.
- Keep `LINK_ALLOW_LEGACY_FALLBACK=false` and `PEOPLE_ALLOW_LEGACY_AUTH=false` outside controlled local fallback scenarios.

## Full Development Mode

```bash
pnpm dev:full
```

This starts:

- Next.js on port `3001`
- Inngest dev server targeting `http://localhost:3001/api/inngest`
- Email preview server on port `3002`

## Environment Variables

Copy `.env.example` to `.env.local` and fill in local values:

```bash
cp .env.example .env.local
```

Keep secrets in `.env.local`. Do not commit real `.env*` files.

### Required for most local work

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Cookie session encryption secret |
| `LINK_CLIENT_ID` / `LINK_CLIENT_SECRET` | SAST Link OAuth app credentials |
| `LINK_API_BASE_URL` | Link JSON API base |
| `LINK_AUTH_BASE_URL` | Link OAuth authorize / token base |

### Common optional integrations

| Variable | Purpose |
| --- | --- |
| `PEOPLE_PUBLIC_BASE_URL` | Public People base URL used in Feishu bot cards and callbacks |
| `FEISHU_OAUTH_REDIRECT_URI` | Must match the Feishu developer console allowlist |
| `FEISHU_EVENT_VERIFICATION_TOKEN` / `FEISHU_EVENT_ENCRYPT_KEY` | Feishu event subscription |
| `FEISHU_INTERVIEW_CHAT_ID` | Optional group chat for privacy-safe interview schedule cards |
| `APP_ID` / `APP_SECRET` / `NONCESTR` | Feishu app credentials used by interview scheduling |
| `EMAIL_*` | SMTP, retries, rate limits, webhook secret, non-production recipient guard |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Runtime error reporting |
| `SENTRY_BUILD_PLUGIN` | Enable Sentry build plugin only when intentionally needed |

### Production runtime env

For production Docker deployment, runtime secrets live on the server at:

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

`PEOPLE_PUBLIC_BASE_URL` must be set in production so Feishu bot cards can link back to People. `FEISHU_OAUTH_REDIRECT_URI` must match the exact URL allowlisted in the Feishu developer console, for example `https://people.sast.fun/api/auth/feishu`.

## Documentation

| Document | Purpose |
| --- | --- |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution and PR checklist |
| [TESTING.md](TESTING.md) | Jest and Playwright testing guide |
| [CI_CD.md](CI_CD.md) | Quality, test, deploy, and release workflows |
| [docs/PRD.md](docs/PRD.md) | Product requirements |
| [docs/SAST_PEOPLE_V3_LINK_DEV.md](docs/SAST_PEOPLE_V3_LINK_DEV.md) | v3 Link integration plan |
| [docs/PEOPLE_DATABASE_SCHEMA.md](docs/PEOPLE_DATABASE_SCHEMA.md) | People schema source of truth |
| [docs/LINK_DATABASE_SCHEMA.md](docs/LINK_DATABASE_SCHEMA.md) | Link schema reference used by People |
| [docs/FEISHU_INTERVIEW_SCHEDULING_PLAN.md](docs/FEISHU_INTERVIEW_SCHEDULING_PLAN.md) | Interview scheduling design |
| [docs/email-center-design.md](docs/email-center-design.md) | Email center design |
| [docs/email-center-implementation-status.md](docs/email-center-implementation-status.md) | Email center implementation status |
| [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) | Pre-release and staging checklist |
| [CHANGELOG.md](CHANGELOG.md) | Notable changes |

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the Next.js development server on port `3000` |
| `pnpm dev:db` | Alias of `pnpm dev` |
| `pnpm dev:full` | Start Next.js (`3001`), Inngest, and email preview (`3002`) |
| `pnpm db:dev:up` | Start local Docker PostgreSQL on port `55432` |
| `pnpm db:dev:down` | Stop local Docker PostgreSQL |
| `pnpm db:dev:logs` | Tail local Docker PostgreSQL logs |
| `pnpm db:migrate` | Apply Drizzle migrations |
| `pnpm db:seed:local` | Seed the local administrator account |
| `pnpm db:seed:demo` | Seed local demo workflow and email snapshot data |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:push` | Push schema changes directly |
| `pnpm db:studio` | Open Drizzle Studio |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run Jest tests |
| `pnpm test:watch` | Run Jest in watch mode |
| `pnpm test:coverage` | Run Jest with coverage |
| `pnpm test:e2e` | Run Playwright end-to-end tests |
| `pnpm build` | Build for production |
| `pnpm start` | Serve the production build |
| `pnpm exec tsc --noEmit` | Typecheck without emitting files |

## Project Structure

```text
app/                    Next.js App Router pages, layouts, and route handlers
action/                 Server Actions for mutations and workflow operations
components/             Feature UI and shared components
components/ui/          shadcn/ui primitives
const/                  Shared constants
db/                     Drizzle schema and database client
docs/                   Project documentation and design notes
e2e/                    Playwright end-to-end specs
emails/                 react-email templates
event/                  Domain / integration event helpers
hooks/                  Client data hooks
lib/                    DAL, session, Link, Feishu, email, AI, Sentry helpers
migrations/             Ordered Drizzle SQL migrations
public/                 Static assets
queue/                  Inngest background jobs
scripts/                Seed, SQL, and Playwright helper scripts
types/                  Shared TypeScript types
proxy.ts                Next.js request proxy / middleware entry
instrumentation*.ts     Runtime and client instrumentation entrypoints
```

### Main dashboard routes

| Route | Purpose |
| --- | --- |
| `/dashboard` | Home |
| `/dashboard/flow` | Flow management |
| `/dashboard/recruitment` | Written recruitment operations |
| `/dashboard/review` | Review and marking |
| `/dashboard/user-flow` | User-flow administration |
| `/dashboard/approvals` | Interview evaluation final approval |
| `/dashboard/emails` | Email center |
| `/dashboard/manage` | User management via Link |
| `/dashboard/audit` | Operation audit log |
| `/dashboard/error-log` | Server error log |

## Database

Schema is defined in `db/schema.ts`. Migrations live in `migrations/` and should remain ordered by numeric prefix.

Current core tables:

| Table | Purpose |
| --- | --- |
| `user` | Legacy fallback and migration only |
| `flow` | Workflow definition |
| `flow_step` | Workflow steps |
| `user_flow` | User registration and progress status |
| `problem` | Written exam problems |
| `user_point` | Grading records |
| `interview_evaluation` | Interview review and final approval |
| `interview_schedule` | Feishu interview schedule and meeting records |
| `user_oauth_account` | People-side third-party OAuth token bindings |
| `email_template_setting` | Result email template settings |
| `email_template_content` | Shared email template content |
| `email_batch` | Result email sending batches |
| `email_delivery` | Per-user email delivery records |
| `email_delivery_attempt` | Send attempts and provider receipts |
| `email_send_rate_limit` | Global send rate-limit buckets |
| `operation_audit` | Administrative operation audit logs |

People business tables store Link user IDs after the v3.1 migration. See [People database schema](docs/PEOPLE_DATABASE_SCHEMA.md) for field-level details.

## Verification

Before opening a pull request or deploying, run:

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

Focused Jest tests:

```bash
pnpm test -- --runInBand components/recruitment/table.test.tsx
```

Focused Playwright suites live under `e2e/`:

```bash
pnpm test:e2e
```

CI orchestration is documented in [CI_CD.md](CI_CD.md). Release and staging manual checks are tracked in [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).

## Notes

- Do not commit real `.env*` files. `.env.example` is the tracked template.
- Only expose safe client-side values through `NEXT_PUBLIC_*`.
- Prefer Docker PostgreSQL for local UI and workflow testing.
- Run migrations before using features that depend on new enums or tables.
- Keep Link and Feishu credentials out of client bundles, logs, and commits.
- Non-production email sending is guarded by `EMAIL_TEST_RECIPIENT` unless intentionally reconfigured.

## License

SAST People Next is developed and maintained by NJUPT SAST and released under the [MIT License](LICENSE).
