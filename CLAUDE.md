# CLAUDE.md

## Project Overview

Recruitment workflow web application for NJUPT SAST, covering registration, grading, interview review, approvals, result notifications, and related admin flows.

## Stack

- Next.js 16 App Router, React 19, TypeScript with `strict` enabled.
- Tailwind CSS v4 with shadcn/ui (`new-york` style, neutral base color, CSS variables) and lucide-react icons.
- Jest 30 with Testing Library and jsdom for unit/component tests.
- Drizzle ORM with PostgreSQL; schema lives in `db/schema.ts`, migrations are generated into `migrations/`.
- Inngest is exposed through `app/api/inngest/route.ts`.
- React Email templates live in `emails/`.
- Sentry wraps `next.config.ts`; sourcemap upload is disabled and telemetry is off.

## Commands

Always use `pnpm`.

```bash
pnpm dev
pnpm dev:full
pnpm dev:db
pnpm build
pnpm start
pnpm lint
pnpm test
pnpm test:watch
pnpm test:coverage
pnpm exec tsc --noEmit
```

Local database and Drizzle commands:

```bash
pnpm db:dev:up
pnpm db:dev:down
pnpm db:dev:logs
pnpm db:generate
pnpm db:migrate
pnpm db:push
pnpm db:studio
pnpm db:seed:local
pnpm db:seed:demo
```

`pnpm dev:full` starts Next.js on port 3001, Inngest Dev Server, and the React Email preview server on port 3002.

## Architecture

- `app/`: Next.js App Router pages, layouts, route handlers, and global styles.
- `components/ui/`: reusable shadcn/ui primitives.
- `components/`: feature components grouped by domain.
- `hooks/`: shared client hooks.
- `lib/`: shared utilities and service helpers.
- `types/`: shared TypeScript types.
- `db/`: Drizzle client and schema.
- `emails/`: React Email templates.
- `scripts/`: SQL seeds and maintenance scripts.
- `public/`: static assets.

## Coding Conventions

- Prefer the `@/` import alias for internal imports.
- Keep Server Components as the default in `app/`; add `"use client"` only where client state, effects, browser APIs, or event handlers are required.
- Match existing shadcn/ui composition patterns and Tailwind utility style. Use `components/ui` primitives before adding new custom primitives.
- Use `lucide-react` for icons, consistent with `components.json`.
- For forms, prefer the existing React Hook Form, Zod, and shadcn/ui form patterns.
- For data access and fetching, follow existing Drizzle, axios, SWR, and server-action/API-route patterns rather than introducing a new approach.
- Keep edits scoped. Do not do unrelated visual redesigns, formatting churn, or broad refactors.

## Testing And Validation

- Testing details live in `TESTING.md`; treat it as the source of truth for test setup and examples.
- Co-locate tests as `*.test.ts` or `*.test.tsx` next to the source when practical.
- For component and UI behavior changes, run the relevant Jest test file or `pnpm test`.
- For shared logic, API routes, database code, or type-sensitive changes, run `pnpm exec tsc --noEmit` when practical.
- Before larger changes, prefer `pnpm lint` and, when user-facing behavior or Next.js boundaries changed, `pnpm build`.
- For database schema changes, update `db/schema.ts` and generate migrations with `pnpm db:generate`; do not hand-edit generated migrations unless there is a clear reason.

## Deployment Notes

- `next.config.ts` uses `output: "standalone"` for deployment.
- Images are configured with `unoptimized: true`.
- Server Actions allow origins matching `*.sast.fun`, `127.0.0.1`, and `localhost`.
- Keep secrets in `.env.local` or deployment environment variables; only expose safe client values through `NEXT_PUBLIC_*`.
