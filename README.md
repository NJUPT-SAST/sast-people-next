# SAST People Next

SAST People Next is a member management and recruitment scoring platform for **NJUPT SAST**. It is built with **Next.js 16**, **React 19**, **TypeScript**, **Tailwind CSS v4**, **shadcn/ui**, and **Drizzle ORM**.

## Features

- Recruitment flow management for written recruitment, exemption recruitment, WOC/WOD, and SOC/SOD
- Fixed workflow steps based on flow type, with editable step titles and descriptions
- Written exam grading with QR code scanning and manual student ID lookup
- Score aggregation for all registered candidates, including ungraded candidates with score `0`
- Pass/fail list management for written recruitment
- One-click result email sending that locks final written recruitment results
- Lecturer interview evaluation for exemption recruitment, WOC/WOD, and SOC/SOD
- Administrator approval for final evaluation flow decisions
- Role synchronization from final accepted flows
- User search, pagination, profile viewing, role editing, and account banning
- Feishu OAuth login and session-based authentication
- Mock mode for local development without PostgreSQL

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 App Router |
| UI | React 19, Tailwind CSS v4, shadcn/ui |
| Database | PostgreSQL, Drizzle ORM |
| Auth | Encrypted cookie sessions |
| Data fetching | Server Components, Server Actions, SWR |
| Email | Inngest, react-email, nodemailer |
| Testing | Jest, Testing Library |

## Roles

The application uses four numeric roles:

| Role | Name | Meaning |
| --- | --- | --- |
| `0` | New student | A newly registered student |
| `1` | Member | A SAST member |
| `2` | Lecturer | A lecturer who can review interviews and grade |
| `3` | Administrator | An administrator who can manage flows, approvals, and final decisions |

Role upgrades are derived from final accepted flows. Session role data is read from the database so permission display stays aligned with stored user data.

## Recruitment Workflows

### Written Recruitment

Flow type: `recruitment`

Fixed steps:

1. Registration
2. Grading
3. Admission confirmation

Students register directly into the grading stage. Lecturers grade written exam submissions. Administrators then mark every candidate as passed or failed.

Pass/fail selection and email delivery are separate operations. After all candidates have been marked as passed or failed, administrators send result emails with a single button. Sending result emails locks the list:

- `passed` becomes `accepted`
- `failed` becomes `rejected`
- The list can no longer be edited from score management
- Passed candidates are upgraded to members after result email sending succeeds

Administrators can still manually adjust user roles from user management when needed.

### Exemption Recruitment

Flow type: `recruitment_exemption`

Fixed steps:

1. Registration
2. Lecturer review
3. Administrator review

Lecturers submit an interview evaluation and meeting link. Administrators approve or reject the evaluation. Final approval upgrades the user to member.

### WOC/WOD

Flow type: `woc`

WOC/WOD uses the same evaluation workflow as exemption recruitment. A new student who passes WOC/WOD is upgraded to member. An existing member remains a member.

### SOC/SOD

Flow type: `soc`

SOC/SOD uses the same evaluation workflow as exemption recruitment. Final approval upgrades the user to lecturer.

## Flow Step Rules

Step count, step order, and step types are fixed by flow type. Administrators may edit only step titles and descriptions.

Only written recruitment flows expose written exam editing. Exemption recruitment, WOC/WOD, and SOC/SOD use registration, lecturer review, and administrator review only.

## Status Model

`user_flow.status` uses the following values:

| Status | Meaning |
| --- | --- |
| `pending` | Not started |
| `ongoing` | In progress or waiting for decision |
| `passed` | Written recruitment candidate marked as passed before result email sending |
| `failed` | Written recruitment candidate marked as failed before result email sending |
| `accepted` | Final accepted status |
| `rejected` | Final rejected status |

For written recruitment, `passed`/`failed` and `accepted`/`rejected` should not be mixed in normal operation. Once result emails are sent, the written recruitment list is locked.

## Prerequisites

- Node.js 20+
- pnpm 8+
- PostgreSQL 14+ for full database mode

PostgreSQL is not required when running in mock mode.

## Quick Start

```bash
pnpm install
pnpm dev
```

The default development server runs at:

```text
http://localhost:3000
```

## Mock Mode

```bash
pnpm dev:mock
```

Mock mode sets `NEXT_PUBLIC_MOCK=true` and replaces the database, session, and event modules with in-memory implementations. It uses `pg-mem` and seeds a default administrator session with role `3`.

## Full Development Mode

```bash
pnpm dev:full
```

This starts:

- Next.js on port `3001`
- Inngest dev server
- Email preview server on port `3002`

## Environment Variables

Create `.env.local` in the project root:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/sast_people
NEXT_PUBLIC_MOCK=true
SESSION_SECRET=replace-with-a-long-random-secret
```

Use `NEXT_PUBLIC_MOCK=true` only for local mock mode.

## Commands

```bash
pnpm dev                 # Start the development server
pnpm dev:mock            # Start with the in-memory mock database
pnpm dev:full            # Start Next.js, Inngest, and email preview
pnpm build               # Build for production
pnpm start               # Start the production server
pnpm lint                # Run ESLint
pnpm test                # Run all Jest tests
pnpm test:watch          # Run Jest in watch mode
pnpm test:coverage       # Run tests with coverage
pnpm exec tsc --noEmit   # Run TypeScript type checking
pnpm db:generate         # Generate Drizzle migrations
pnpm db:migrate          # Apply Drizzle migrations
pnpm db:push             # Push schema changes directly
pnpm db:studio           # Open Drizzle Studio
```

## Project Structure

```text
app/                    Next.js App Router pages and API routes
components/             Shared UI and feature components
components/ui/          shadcn/ui primitives
action/                 Server Actions for mutations and workflow operations
db/                     Drizzle schema and database client
hooks/                  Server and SWR data hooks
lib/                    DAL, session helpers, and shared utilities
mock/                   In-memory mock implementations for local development
migrations/             Drizzle SQL migrations
types/                  Shared TypeScript types
public/                 Static assets
```

## Database

The database schema is defined in `db/schema.ts`. Migrations live in `migrations/` and should remain ordered by numeric prefix.

After schema changes:

```bash
pnpm db:generate
pnpm db:migrate
```

Current core tables include:

- `user`
- `flow`
- `flow_step`
- `user_flow`
- `problem`
- `user_point`
- `email`
- `interview_evaluation`

## Testing And Verification

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

- Do not commit `.env*` files.
- Only expose safe client-side values through `NEXT_PUBLIC_*`.
- Use mock mode for local UI and workflow testing when PostgreSQL is unavailable.
- Run migrations before using features that depend on new enum values such as `passed` and `failed`.

## License

This project is developed and maintained by NJUPT SAST.
