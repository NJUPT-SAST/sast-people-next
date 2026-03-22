# CLAUDE.md

## Project Overview

Web application built with Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, and Jest.

## Development Commands

```bash
pnpm dev
pnpm dev:mock
pnpm dev:full
pnpm build
pnpm start
pnpm lint
pnpm test
pnpm test:watch
pnpm test:coverage
pnpm exec tsc --noEmit
```

## Architecture

- `app/`: Next.js App Router
- `components/`: shared and feature UI
- `lib/`: utilities and shared services
- `mock/`: mock implementations used by `NEXT_PUBLIC_MOCK=true`

## Notes

- Always use `pnpm`.
- `next.config.ts` targets Web deployment with `output: "standalone"`.
- Internal imports should prefer the `@/` alias.
