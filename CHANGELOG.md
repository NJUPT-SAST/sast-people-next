# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Documentation

- Rewrite `README.md` to match the current v3.1 codebase: Link-owned identity, workflow model, Feishu interview scheduling, email center, dashboard routes, commands, and verification.
- Expand documentation index to cover PRD, schema, Feishu scheduling, email center, release checklist, CI/CD, testing, and contributing guides.
- Update `TESTING.md` with Playwright e2e coverage and current test commands.
- Align `CONTRIBUTING.md` with database, seed, and e2e workflows.

### Added

- Next.js 16 App Router application for SAST recruitment and review workflows
- React 19 UI with Tailwind CSS v4 and shadcn/ui
- PostgreSQL + Drizzle ORM schema, migrations, and local seed scripts
- SAST Link OAuth integration for identity, profile, role, and account administration
- Recruitment / exemption / WOC / SOC workflow models and dashboard operations
- Written exam grading with QR-code scanning and score aggregation
- Interview evaluation with administrator final approval
- Feishu interview scheduling: OAuth binding, calendar/VC, bot cards, reminders
- Email center with templates, batches, retries, rate limits, webhooks, and attempt history
- Inngest background jobs for email and interview reminder flows
- Optional server-side AI drafts for summaries and evaluations
- Sentry instrumentation and server error logging
- Jest + Testing Library unit/integration tests
- Playwright end-to-end tests for recruitment, email center, and visual smoke paths
- GitHub Actions quality, test, deploy, and release workflows
- Docker development database and production deployment compose files

### Changed

- `user_flow` progress model simplified to `progress_status`: `not_started` / `ongoing` / `passed` / `failed`
- People business tables store Link user IDs after the v3.1 migration
- Production runtime secrets are managed on the server via `/data/sast-people-next/.env`

### Removed

- Desktop wrapper, Rust build pipeline, and related tooling
- Stale documentation claims such as a missing Chinese README file

## [0.1.0] - 2024-01-28

### Added

- Initial release scaffold with Next.js App Router and basic UI components
