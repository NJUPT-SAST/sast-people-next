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
      scope.setContext("serverErrorLog", { ...context });
      if (context.path) scope.setTag("path", context.path);
      if (context.action) scope.setTag("action", context.action);
      if (context.role !== undefined && context.role !== null) {
        scope.setTag("role", String(context.role));
      }
      if (context.userId !== undefined && context.userId !== null) {
        scope.setUser({ id: String(context.userId) });
      }
    }
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
  });
}
