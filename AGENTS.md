# Repository Guidelines

## Project Structure & Module Organization

- `app/` Next.js App Router pages, layouts, route handlers, and global styles.
- `action/` Server Actions for mutations and workflow operations.
- `components/` Feature UI; `components/ui/` holds shadcn/ui primitives.
- `db/` Drizzle schema and database client; SQL migrations live in `migrations/`.
- `lib/` Shared server utilities (session, Link, Feishu, email, AI, Sentry, DAL).
- `queue/` Inngest background jobs; `emails/` react-email templates.
- `e2e/` Playwright end-to-end specs; unit tests colocate as `*.test.ts(x)`.
- `docs/` Product, schema, and integration documentation.
- `public/` Static assets.
- Root configs: `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `components.json`, `playwright.config.ts`, `jest.config.ts`.

## Build, Test, and Development Commands

- `pnpm dev` — Run Next.js in development on port `3000`.
- `pnpm dev:full` — Next.js (`3001`) + Inngest + email preview (`3002`).
- `pnpm db:dev:up` / `pnpm db:dev:down` — Local Docker PostgreSQL.
- `pnpm db:migrate` / `pnpm db:seed:local` / `pnpm db:seed:demo` — Schema and seed data.
- `pnpm build` / `pnpm start` — Production build and serve.
- `pnpm lint` — Run ESLint. Use `--fix` to auto-fix.
- `pnpm test` / `pnpm test:watch` / `pnpm test:coverage` — Jest.
- `pnpm test:e2e` — Playwright end-to-end suites.
- `pnpm exec tsc --noEmit` — Typecheck.

## Coding Style & Naming Conventions

- Language: TypeScript with React 19 and Next.js 16.
- Linting: `eslint.config.mjs` is the source of truth; keep code warning-free.
- Styling: Tailwind CSS v4 (utility-first). Reuse existing shadcn/ui patterns.
- Components: PascalCase names/exports; files in `components/ui/` mirror export names.
- Routes: Next app files are lowercase (`page.tsx`, `layout.tsx`).
- Code: camelCase variables/functions; hooks start with `use*`.
- Prefer Server Components by default; keep `"use client"` components small.
- Identity, secrets, database access, and admin mutations stay on the server.

## Testing Guidelines

- Unit/component: Jest + Testing Library. Name tests `*.test.ts` / `*.test.tsx` and colocate next to source.
- End-to-end: Playwright specs under `e2e/`, run with `pnpm test:e2e`.
- Prioritize `lib/`, Server Actions, access control, and critical workflow UI.
- See [TESTING.md](TESTING.md) for details and [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) for release acceptance.

## Commit & Pull Request Guidelines

- Prefer Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `ci:`, `test:`.
- Link issues in the footer: `Closes #123`.
- PRs should include: brief scope/intent, screenshots for UI changes, validation steps, and pass `pnpm lint` plus related tests.
- Keep changes focused; avoid unrelated refactors.
- Update README / docs when behavior, env vars, schema, or commands change.

## Security & Configuration Tips

- Use `.env.local` for secrets; do not commit `.env*` files. `.env.example` is the template.
- Only expose safe client values via `NEXT_PUBLIC_*`.
- Prefer Docker PostgreSQL for local development; keep Link/Feishu mock flags off outside controlled local stubs.
- People business data stores Link user IDs; the local `user` table is legacy fallback only.
