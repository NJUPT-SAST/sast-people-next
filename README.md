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
| Department access control | SAST People + SAST Link | Department comes from the Link profile; flows, registrations, grading, evaluations, emails and audit trails are scoped to the owning department, and the platform-wide surface is limited to Link `admin` accounts |
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
| `office_interview` | Registration (first choice = the flow's department, optional second office-department choice, interview slot), interview scoring, result confirmation | Round-2 passers become members |

结果发布后 People 会自动把成员身份同步回 SAST Link：角色（免试/笔试/WOC 任一通过 → 部员、SoC 通过 → 讲师、办公类两轮都通过 → 部员）与**部门归属**（通过某部门流程即归属该部门，先后通过多个部门时以最后一次通过为准；`manager` 及以上账号不改动）——招新不再需要在 Link 手动改部门。

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
| `interview_evaluation.status` | `submitted`, `returned`, `approved`, `rejected` | Lecturer submission, return-for-rewrite, and administrator final review |
| `email_batch.status` | `draft`, `queued`, `completed`, `failed` | Result email batch lifecycle |
| `email_delivery.status` | `pending`, `sending`, `sent`, `failed`, `dead` | Per-recipient delivery state |
| `interview_schedule.status` | `created`, `cancelled`, `failed` | Feishu interview schedule state |

### 办公类部门面试招新 (`office_interview`)

- **一条共享流程**：所有办公部门共用一条 `office_interview` 流程（归属部门为空），流程内配置四个办公部门（投递组别 + 部门映射）与面试时段；办公类部门的账号可共同管理该流程（编辑、评审、发布、发信）。
- 候选人**一次报名**：第一志愿、第二志愿办公部门（第二志愿可空，不能与第一志愿相同）与面试时段；报名记录归属第一志愿部门，`user_flow.round` 记录当前阶段（1=一面，2=二面）。
- **流程内两轮**：一面由面试部长一对一打分；一面通过后系统自动把候选人推进到二轮面试阶段（无需二次报名），二面无领导小组由多位部长分别打分；两轮都通过后 `passed` 并同步部员角色（技术部门为免试/笔试任一通过即部员）。
- 结果邮件：一面结果通知（`office_round1.result.accepted|rejected`，面试管理页「发送一面结果通知」批量发送通过 + 未通过，按钮显示人数）与二面最终结果（`office_round2.result.*`，走结果发布 + 邮件中心）；最终结果只发给进入二面阶段的候选人，一面未通过者不会重复收到不通过邮件。
- 办公类模板由**办公部门统一管理**：一份共享的全局模板（任何办公部门账号可编辑，不走部门覆盖），支持 `{department}`、`{groupNumber}` 变量；办公类邮件不在邮件中心通用发送通道中混排（面试管理页单独发送，发送记录与重试保留）。
- 面试互斥：办公类部门之间同时只能参加一个（技术部门之间暂时不互斥，技术 + 办公可同时参加）。
- 第二志愿可见：办公类部门可在面试管理页查看「第二志愿投递本部门」的候选人只读名单。
- 报名后修改面试时段需候选人申请、部长及以上审批（`interview_slot_change_request`，面试管理页待审批列表）。

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
```

Then:

```bash
pnpm db:migrate
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
pnpm db:seed:demo
```

### SAST Link

SAST Link owns user identity and profile data. Configure `LINK_*` variables for the target Link environment.

- Use `LINK_USE_MOCK=true` only as a temporary local stub when Link is unavailable.
- Do not enable `LINK_USE_MOCK=true` for production or real-user testing.

## Full Development Mode

```bash
pnpm dev:full
```

This starts:

- Next.js on port `3001`
- Inngest dev server targeting `http://localhost:3001/api/inngest`
- Email preview server on port `3002`

Before starting, the script stops any instance left over from a previous run (recorded in `tmp/dev-all.pid` plus processes holding `3001`/`3002`), so a crashed or forgotten run does not block the next one. `Ctrl+C` stops the app servers and the containers.

### Local test accounts (Link mock)

With `LINK_USE_MOCK=true`, the login page lists every mock account; click one to fill its student id. Accounts cover all seven departments:

| Student ID | Role | Department |
| --- | --- | --- |
| `B00000000` | 管理员 (role 4, Link `admin`) | 跨部门 |
| `B11111111` … `B77777777` | 部长 (role 3, Link `manager`) | 软件研发部 / 多媒体部 / 电子部 / 办公室 / 外联部 / 科宣部 / 赛事部 |
| `B<d>0000001` | 讲师 (role 2, Link `lecturer`) | 对应部门，例如 `B10000001` |
| `B<d>0000002` / `B<d>0000003` | 部员 (role 1, Link `member`) | 对应部门，例如 `B10000002` |
| `B00040001` … `B00040011` | 原有演示账号 | 混合角色与部门 |

`pnpm db:seed:demo` seeds demo departments and email-template rows; `B00000000` (Link user id `101`) is the mock `admin`, so it can manage departments and templates right away.

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
| `DATABASE_MIGRATION_URL` | Optional migration connection string; production should use a separate DDL-capable release account |
| `DATABASE_POOL_MAX` | Required in production: per-process PostgreSQL connection limit. The local default is `20`; calculate the production value across every web and worker process so their combined pools stay within the database budget. |
| `DATABASE_POOL_IDLE_TIMEOUT_MS` / `DATABASE_POOL_CONNECTION_TIMEOUT_MS` | Optional pool timeouts in milliseconds (defaults: `30000` / `10000`; `0` disables that timeout). |
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

Production schema migrations run automatically during `deploy.yml` before the new application image is activated. The migration image is built from the same commit as the application image and uses `DATABASE_MIGRATION_URL` when configured; keep `DATABASE_URL` restricted to the application runtime account.

This does not require rebuilding or copying a new image. Build-time public variables such as `NEXT_PUBLIC_SENTRY_DSN` are still passed through GitHub Actions because Next.js inlines `NEXT_PUBLIC_*` values during `pnpm build`.

`PEOPLE_PUBLIC_BASE_URL` must be set in production so Feishu bot cards can link back to People. `FEISHU_OAUTH_REDIRECT_URI` must match the exact URL allowlisted in the Feishu developer console, for example `https://people.sast.fun/api/auth/feishu`.

## Documentation

| Document | Purpose |
| --- | --- |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution and PR checklist |
| [TESTING.md](TESTING.md) | Jest and Playwright testing guide |
| [CI_CD.md](CI_CD.md) | Quality, test, deploy, and release workflows |
| [docs/SAST_PEOPLE_V3_LINK_DEV.md](docs/SAST_PEOPLE_V3_LINK_DEV.md) | v3 Link integration plan |
| [docs/PEOPLE_DATABASE_SCHEMA.md](docs/PEOPLE_DATABASE_SCHEMA.md) | People schema source of truth |
| [docs/FEISHU_INTERVIEW_SCHEDULING_PLAN.md](docs/FEISHU_INTERVIEW_SCHEDULING_PLAN.md) | Interview scheduling design |
| [docs/email-center-design.md](docs/email-center-design.md) | Email center platform design |
| [docs/email-center-flow-redesign.md](docs/email-center-flow-redesign.md) | Email center administrator workflow and information architecture |
| [docs/department-access-control.md](docs/department-access-control.md) | Department-level access control model and rollout |
| [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) | Pre-release and staging checklist |
| [CHANGELOG.md](CHANGELOG.md) | Notable changes |

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the Next.js development server on port `3000` |
| `pnpm dev:db` | Alias of `pnpm dev` |
| `pnpm dev:local` | Start local PostgreSQL + Inngest containers, Next.js on `3001`, and the email preview on `3002`; stops instances left over from a previous run, and shuts all of it down when Next.js stops |
| `pnpm dev:full` | Start Next.js (`3001`), Inngest, and email preview (`3002`) |
| `pnpm db:dev:up` | Start local Docker PostgreSQL on port `55432` |
| `pnpm db:dev:down` | Stop local Docker PostgreSQL |
| `pnpm db:dev:logs` | Tail local Docker PostgreSQL logs |
| `pnpm db:migrate` | Apply Drizzle migrations |
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

People business tables store Link user IDs after the v3 migration. See [People database schema](docs/PEOPLE_DATABASE_SCHEMA.md) for field-level details.

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
