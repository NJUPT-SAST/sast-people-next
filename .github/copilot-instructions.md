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
- `mock/` contains mock implementations used in mock mode.
- Use the `@/` alias for internal imports.

## Common Commands

```bash
pnpm install
pnpm dev
pnpm dev:mock
pnpm dev:full
pnpm build
pnpm lint
pnpm test
```

## Configuration Notes

- `next.config.ts` is configured for Web deployment with `output: "standalone"`.
- Mock mode swaps selected server modules using Turbopack and Webpack aliases.
- ESLint uses the flat config format with Next.js presets.
