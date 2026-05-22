# SAST People Next

A member management and recruitment scoring platform built for **NJUPT SAST**, powered by **Next.js 16**, **React 19**, **TypeScript**, and **Tailwind CSS v4**.

## Features

- **QR Code Scanning & Grading** — Scan student QR codes to pull up profiles and score exam submissions
- **Recruitment Management** — Create recruitment flows with configurable steps (registering, checking, judging, email, finished)
- **Score Aggregation** — View and filter exam scores by recruitment flow
- **User Management** — Search, paginate, and manage users; ban or edit user flow progress
- **Role-Based Access Control** — Three-tier role system: user (0), admin (1), super admin (2)
- **Email Notifications** — Automated acceptance/rejection emails via Inngest event system
- **Feishu (Lark) Integration** — OAuth login via Feishu

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS v4 + shadcn/ui |
| Database | PostgreSQL (via Drizzle ORM) |
| Auth | Session-based (encrypted cookies) |
| Testing | Jest + @testing-library/react |
| CI/CD | GitHub Actions |
| Email | Inngest + react-email |

## Prerequisites

- Node.js 20+
- pnpm 8+
- PostgreSQL 14+ (not required in mock mode)

## Quick Start

```bash
pnpm install
pnpm dev
```

The dev server runs at `http://localhost:3000`.

### Mock Mode (No Database Required)

```bash
pnpm dev:mock
```

Mock mode replaces the database, session, and event system with in-memory implementations via [pg-mem](https://github.com/oguimbal/pg-mem). A default admin user (`role: 2`) is automatically seeded.

### Full Mode

```bash
pnpm dev:full
```

Starts Next.js (port 3001), Inngest dev server, and the email preview server (port 3002).

## Environment Variables

Create a `.env.local` file at the project root:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/sast_people
NEXT_PUBLIC_MOCK=true          # Set to "true" to enable mock mode
```

## Available Commands

```bash
pnpm dev              # Start development server
pnpm dev:mock         # Start with in-memory mock database
pnpm dev:full         # Start with Inngest + email preview
pnpm build            # Production build (standalone output)
pnpm start            # Start production server
pnpm lint             # Run ESLint
pnpm test             # Run all tests
pnpm test:watch       # Run tests in watch mode
pnpm test:coverage    # Run tests with coverage report
pnpm exec tsc --noEmit  # TypeScript type check
```

## Project Structure

```text
app/                    Next.js App Router pages and API routes
├── api/                REST API routes (SWR data sources)
├── dashboard/          Main app pages (manage, flow, recruitment, review, user-flow)
└── login/              Login page with Feishu OAuth
components/             Shared UI and feature components
├── ui/                 shadcn/ui primitives
├── manage/             User management and flow editing
├── flow/               Recruitment flow CRUD
├── recruitment/        Score table and flow selector
├── review/             QR code scanner and grading UI
├── userInfo/           Profile editing
└── magicui/            Animated UI components
action/                 Server actions (form handling, DB writes)
├── flow/               Flow and problem CRUD
└── user-flow/          User flow progression (forward, backward, reject, etc.)
db/                     Drizzle schema and database client
hooks/                  Data fetching hooks (SWR + server)
lib/                    Utilities, DAL (auth/session), dayjs config
mock/                   In-memory mocks for local development
const/                  Constants (cookie names, etc.)
types/                  TypeScript type definitions
public/                 Static assets
.github/workflows/      CI/CD pipeline definitions
```

## Database

The project uses PostgreSQL with [Drizzle ORM](https://orm.drizzle.team/).

```bash
# Generate migrations after schema changes
pnpm exec drizzle-kit generate

# Apply migrations
pnpm exec drizzle-kit migrate

# Open Drizzle Studio (database GUI)
pnpm exec drizzle-kit studio
```

Schema is defined in `db/schema.ts` with the following main tables:

- **`user`** — Members with roles (0=user, 1=admin, 2=super admin)
- **`flow`** — Recruitment flows (title, description, start/end time, owner)
- **`flow_step`** — Steps within a flow (registering, checking, judging, email, finished)
- **`user_flow`** — Tracks each user's progress through a flow
- **`problem`** — Exam problems linked to a step
- **`user_point`** — Scores per user per problem
- **`email`** — Email templates linked to flow steps

## Authentication

- Login is handled via Feishu (Lark) OAuth
- Session is stored in an encrypted cookie named `session`
- Development mode also provides a `TestLogin` component for quick access
- Mock mode seeds a default admin session (`role: 2`)

## Architecture

- **Server Components** — Data fetching on the server; pages use async server components with Suspense boundaries
- **Client Components** — Interactive UI (`'use client'`) with react-hook-form, SWR for data fetching, and Radix UI primitives
- **Server Actions** — All mutations go through `'use server'` actions in `action/`, which validate auth and write to the database
- **API Routes** — Some data is fetched via SWR from `/api/*` endpoints (particularly in the manage section)

## CI/CD

The project has five GitHub Actions workflows:

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `ci.yml` | PRs to `master` | Lint, type check, build |
| `test.yml` | Push to `master` | Run full test suite |
| `quality.yml` | Push to `master` | Code quality & security scan |
| `deploy.yml` | Quality check passes | Docker build, push, and deploy via SSH |
| `release.yml` | Tag push (`v*`) | Create GitHub release |

## Verification

Before pushing, run:

```bash
pnpm lint
pnpm test
pnpm build
```

## License

This project is developed and maintained by [NJUPT SAST](https://sast.fun).
