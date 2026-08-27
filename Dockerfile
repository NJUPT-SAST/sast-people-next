# Stage 1: Install dependencies
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Stage 2: Build the Next.js application
FROM builder AS app-builder
COPY . .
ARG NEXT_PUBLIC_SENTRY_DSN
RUN rm -rf /app/.codegraph && mkdir -p /app/.codegraph
RUN pnpm build

# Stage 3: Runtime application image
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S -G app app
COPY --from=app-builder --chown=app:app /app/.next/standalone ./
COPY --from=app-builder --chown=app:app /app/.next/static ./.next/static
COPY --from=app-builder --chown=app:app /app/public ./public
USER app
EXPOSE 3003
ENV PORT=3003
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 exec node server.js"]

# Stage 4: One-shot production migration image
# Keep this image independent from the full application/dev dependency tree.
FROM node:22-alpine AS migrator
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
WORKDIR /app
ENV NODE_ENV=production
COPY migrator/package.json migrator/pnpm-lock.yaml migrator/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
RUN addgroup -S migrator && adduser -S -G migrator migrator
COPY --chown=migrator:migrator drizzle.config.ts ./
COPY --chown=migrator:migrator migrations ./migrations
COPY --chown=migrator:migrator db ./db
COPY --chown=migrator:migrator scripts/check-db-permissions.mjs ./scripts/check-db-permissions.mjs
USER migrator
CMD ["sh", "-c", "test -n \"$DATABASE_MIGRATION_URL\" || { echo 'DATABASE_MIGRATION_URL is required for production migrations.' >&2; exit 1; }; exec pnpm db:migrate"]
