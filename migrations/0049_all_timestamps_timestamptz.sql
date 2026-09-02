-- Convert legacy timestamp columns without changing their historical instant.
-- Columns with a DB DEFAULT now() retain the Asia/Shanghai interpretation used
-- by the old connection. Columns without a default that are written from JS
-- Dates through Drizzle are interpreted as UTC wall-clock values instead.

ALTER TABLE "flow"
  ALTER COLUMN "created_at" DROP DEFAULT,
  ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "created_at" SET DEFAULT now(),
  ALTER COLUMN "started_at" DROP DEFAULT,
  ALTER COLUMN "started_at" TYPE timestamptz USING "started_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "started_at" SET DEFAULT now(),
  ALTER COLUMN "ended_at" TYPE timestamptz USING "ended_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updated_at" DROP DEFAULT,
  ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "flow_step"
  ALTER COLUMN "created_at" DROP DEFAULT,
  ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "created_at" SET DEFAULT now(),
  ALTER COLUMN "updated_at" DROP DEFAULT,
  ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "user_flow"
  ALTER COLUMN "created_at" DROP DEFAULT,
  ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "created_at" SET DEFAULT now(),
  ALTER COLUMN "updated_at" DROP DEFAULT,
  ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "email_batch"
  ALTER COLUMN "created_at" DROP DEFAULT,
  ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "created_at" SET DEFAULT now(),
  ALTER COLUMN "updated_at" DROP DEFAULT,
  ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "email_delivery"
  ALTER COLUMN "last_attempt_at" TYPE timestamptz USING "last_attempt_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "next_retry_at" TYPE timestamptz USING "next_retry_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "dead_lettered_at" TYPE timestamptz USING "dead_lettered_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" DROP DEFAULT,
  ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "created_at" SET DEFAULT now(),
  ALTER COLUMN "sent_at" TYPE timestamptz USING "sent_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" DROP DEFAULT,
  ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "email_delivery_attempt"
  ALTER COLUMN "started_at" DROP DEFAULT,
  ALTER COLUMN "started_at" TYPE timestamptz USING "started_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "started_at" SET DEFAULT now(),
  ALTER COLUMN "finished_at" TYPE timestamptz USING "finished_at" AT TIME ZONE 'UTC';

ALTER TABLE "email_send_rate_limit"
  ALTER COLUMN "window_start" TYPE timestamptz USING "window_start" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" DROP DEFAULT,
  ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "email_template_setting"
  ALTER COLUMN "updated_at" DROP DEFAULT,
  ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "email_template_content"
  ALTER COLUMN "updated_at" DROP DEFAULT,
  ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "user_point"
  ALTER COLUMN "created_at" DROP DEFAULT,
  ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "user_oauth_account"
  ALTER COLUMN "access_token_expires_at" TYPE timestamptz USING "access_token_expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "refresh_token_expires_at" TYPE timestamptz USING "refresh_token_expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" DROP DEFAULT,
  ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "created_at" SET DEFAULT now(),
  ALTER COLUMN "updated_at" DROP DEFAULT,
  ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "people_session"
  ALTER COLUMN "expires_at" TYPE timestamptz USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "link_access_token_expires_at" TYPE timestamptz USING "link_access_token_expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "link_admin_access_token_expires_at" TYPE timestamptz USING "link_admin_access_token_expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" DROP DEFAULT,
  ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "created_at" SET DEFAULT now(),
  ALTER COLUMN "updated_at" DROP DEFAULT,
  ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "interview_schedule"
  ALTER COLUMN "starts_at" TYPE timestamptz USING "starts_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "ends_at" TYPE timestamptz USING "ends_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "meeting_ended_at" TYPE timestamptz USING "meeting_ended_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" DROP DEFAULT,
  ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "created_at" SET DEFAULT now(),
  ALTER COLUMN "updated_at" DROP DEFAULT,
  ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "operation_audit"
  ALTER COLUMN "created_at" DROP DEFAULT,
  ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "interview_schedule_cancellation_outbox"
  ALTER COLUMN "next_attempt_at" DROP DEFAULT,
  ALTER COLUMN "next_attempt_at" TYPE timestamptz USING "next_attempt_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "next_attempt_at" SET DEFAULT now(),
  ALTER COLUMN "locked_until" TYPE timestamptz USING "locked_until" AT TIME ZONE 'UTC',
  ALTER COLUMN "last_attempt_at" TYPE timestamptz USING "last_attempt_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "published_at" TYPE timestamptz USING "published_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" DROP DEFAULT,
  ALTER COLUMN "created_at" TYPE timestamptz USING "created_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "created_at" SET DEFAULT now(),
  ALTER COLUMN "updated_at" DROP DEFAULT,
  ALTER COLUMN "updated_at" TYPE timestamptz USING "updated_at" AT TIME ZONE 'Asia/Shanghai',
  ALTER COLUMN "updated_at" SET DEFAULT now();
