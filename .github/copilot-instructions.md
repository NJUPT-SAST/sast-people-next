# Copilot Instructions

## Project Architecture

This repository is a Next.js 16 web application using:

- React 19
- TypeScript
- Tailwind CSS v4
- shadcn/ui
- Jest + Testing Library

## Key Conventions

- `app/` contains App Router routes and layouts.
- `components/ui/` contains reusable UI primitives.
- `lib/` contains shared utilities and helpers.
- Use the `@/` alias for internal imports.

## Common Commands

```bash
pnpm install
pnpm dev
pnpm dev:local
pnpm dev:full
pnpm build
pnpm lint
pnpm test
```

## Configuration Notes

- `next.config.ts` is configured for Web deployment with `output: "standalone"`.
- `pnpm dev:local` starts the local development workflow defined in `scripts/dev-local.sh`.
- ESLint uses the flat config format with Next.js presets.
