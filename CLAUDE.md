# CLAUDE.md

Recruitment workflow app for NJUPT SAST.

Identity and profile data come from **SAST Link**. People owns workflows, grading, interview review/scheduling, email notifications, and admin operations.

## Stack

Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4, shadcn/ui, lucide-react, Jest 30, Playwright, Drizzle ORM with PostgreSQL, Inngest, React Email, Feishu/Lark SDK, and Sentry.

## Commands

Use `pnpm`.

- Dev/build/test: `pnpm dev`, `pnpm dev:full`, `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm exec tsc --noEmit`
- DB: `pnpm db:dev:up`, `pnpm db:dev:down`, `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:push`, `pnpm db:studio`, `pnpm db:seed:local`, `pnpm db:seed:demo`

`pnpm dev:full` runs Next.js on 3001, Inngest Dev Server, and React Email preview on 3002.

## Project Map

- `app/`: App Router pages, layouts, route handlers
- `action/`: Server Actions
- `components/ui/`: shadcn/ui primitives
- `components/`: feature components
- `lib/`: shared utilities/services (Link, Feishu, email, AI, session, Sentry)
- `db/schema.ts`: Drizzle schema; generated migrations go in `migrations/`
- `queue/`: Inngest jobs
- `emails/`: React Email templates
- `e2e/`: Playwright specs
- `docs/`: product, schema, and integration docs

## Conventions

- Prefer `@/` imports for internal code.
- Keep Server Components by default; add `"use client"` only when browser/client state is needed.
- Follow existing shadcn/ui, Tailwind, React Hook Form, Zod, Drizzle, axios/SWR, server-action/API-route patterns.
- Use `lucide-react` icons.
- Keep edits scoped; avoid unrelated redesigns, refactors, formatting churn, or new frameworks.
- Tests live near source as `*.test.ts(x)` when practical. Playwright lives in `e2e/`. See `TESTING.md`.
- For DB changes, update `db/schema.ts` and run `pnpm db:generate`; do not hand-edit generated migrations unless necessary.
- Do not treat the legacy People `user` table as the source of truth for identity.
- Full onboarding and command reference: `README.md`.
