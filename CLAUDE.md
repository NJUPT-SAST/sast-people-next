# CLAUDE.md

Recruitment workflow app for NJUPT SAST.

## Stack

Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4, shadcn/ui, lucide-react, Jest 30, Drizzle ORM with PostgreSQL, Inngest, React Email, Sentry.

## Commands

Use `pnpm`.

- Dev/build/test: `pnpm dev`, `pnpm dev:full`, `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm exec tsc --noEmit`
- DB: `pnpm db:dev:up`, `pnpm db:dev:down`, `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:push`, `pnpm db:studio`, `pnpm db:seed:local`, `pnpm db:seed:demo`

`pnpm dev:full` runs Next.js on 3001, Inngest Dev Server, and React Email preview on 3002.

## Project Map

- `app/`: App Router pages, layouts, route handlers
- `components/ui/`: shadcn/ui primitives
- `components/`: feature components
- `lib/`: shared utilities/services
- `db/schema.ts`: Drizzle schema; generated migrations go in `migrations/`
- `emails/`: React Email templates

## Conventions

- Prefer `@/` imports for internal code.
- Keep Server Components by default; add `"use client"` only when browser/client state is needed.
- Follow existing shadcn/ui, Tailwind, React Hook Form, Zod, Drizzle, axios/SWR, server-action/API-route patterns.
- Use `lucide-react` icons.
- Keep edits scoped; avoid unrelated redesigns, refactors, formatting churn, or new frameworks.
- Tests live near source as `*.test.ts(x)` when practical. See `TESTING.md` for details.
- For DB changes, update `db/schema.ts` and run `pnpm db:generate`; do not hand-edit generated migrations unless necessary.
