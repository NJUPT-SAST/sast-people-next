import "server-only";

import * as Sentry from "@sentry/nextjs";

export interface ServerErrorLogContext {
  path?: string;
  method?: string;
  userId?: number | null;
  role?: number | null;
  action?: string;
  flowId?: number | null;
  userFlowId?: number | null;
  studentId?: string | null;
  targetUserId?: number | null;
  metadata?: Record<string, unknown>;
}

const sensitiveMetadataKeys = new Set([
  "authorization",
  "accesstoken",
  "refreshtoken",
  "cookie",
  "email",
  "identifier",
  "ip",
  "name",
  "openid",
  "password",
  "phone",
  "secret",
  "studentid",
  "token",
  "useragent",
]);

function isSensitiveMetadataKey(key: string) {
  return sensitiveMetadataKeys.has(key.replace(/[^a-z]/gi, "").toLowerCase());
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeMetadataValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, nestedValue]) =>
        isSensitiveMetadataKey(key)
          ? []
          : [[key, sanitizeMetadataValue(nestedValue)]],
      ),
    );
  }

  return value;
}

function sanitizeServerErrorContext(context: ServerErrorLogContext) {
  const { studentId: _studentId, metadata, ...safeContext } = context;

  return metadata
    ? { ...safeContext, metadata: sanitizeMetadataValue(metadata) }
    : safeContext;
}

export function isNextControlFlowError(err: unknown) {
  if (!(err instanceof Error)) return false;
  const digest = (err as Error & { digest?: string }).digest;
  return err.message === "NEXT_REDIRECT" || digest === "DYNAMIC_SERVER_USAGE";
}

export function logServerError(
  source: string,
  err: unknown,
  context?: ServerErrorLogContext,
) {
  if (isNextControlFlowError(err)) return;
  const digest = err instanceof Error
    ? (err as Error & { digest?: string }).digest
    : undefined;

  Sentry.withScope((scope) => {
    scope.setTag("source", source);
    if (digest) scope.setTag("digest", digest);
    if (context) {
      const safeContext = sanitizeServerErrorContext(context);
      scope.setContext("serverErrorLog", safeContext);
      if (safeContext.path) scope.setTag("path", safeContext.path);
      if (safeContext.action) scope.setTag("action", safeContext.action);
      if (safeContext.role !== undefined && safeContext.role !== null) {
        scope.setTag("role", String(safeContext.role));
      }
      if (safeContext.userId !== undefined && safeContext.userId !== null) {
        scope.setUser({ id: String(safeContext.userId) });
      }
    }
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
  });
}
