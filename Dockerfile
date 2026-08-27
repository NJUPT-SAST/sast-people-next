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
RUN rm -f /app/.codegraph && mkdir -p /app/.codegraph
RUN pnpm build

# Stage 3: Runtime application image
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=app-builder /app/.next/standalone ./
COPY --from=app-builder /app/.next/static ./.next/static
COPY --from=app-builder /app/public ./public
EXPOSE 3003
ENV PORT=3003
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 exec node server.js"]

# Stage 4: One-shot production migration image
# This image is run with the server's env file and database network only.
FROM builder AS migrator
WORKDIR /app
ENV NODE_ENV=production
COPY drizzle.config.ts ./
COPY migrations ./migrations
COPY db ./db
CMD ["sh", "-c", "test -n \"$DATABASE_MIGRATION_URL\" || { echo 'DATABASE_MIGRATION_URL is required for production migrations.' >&2; exit 1; }; exec pnpm db:migrate"]
