import * as Sentry from "@sentry/nextjs";
import { sentryIgnoreErrors } from "./lib/sentry-filters";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  ignoreErrors: sentryIgnoreErrors,
  beforeSend(event) {
    /* 本地数据库没启动不是应用异常；开发终端已经能看到，别把它当生产告警。 */
    if (
      process.env.NODE_ENV === "development" &&
      event.exception?.values?.some((value) =>
        /ECONNREFUSED (127\.0\.0\.1|::1):/.test(value.value ?? ""),
      )
    ) {
      return null;
    }
    return event;
  },
});
