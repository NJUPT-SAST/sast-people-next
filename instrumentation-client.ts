import * as Sentry from "@sentry/nextjs";
import { sentryIgnoreErrors } from "./lib/sentry-filters";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  ignoreErrors: sentryIgnoreErrors,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
