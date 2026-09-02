-- Production applied migration 0048 with a journal marker newer than 0049 and
-- 0050, so Drizzle skipped both migrations there. Convert only columns that are
-- still legacy timestamp values. Columns already converted by 0049/0050 remain
-- untouched; this supports both database states without replaying old files.

DO $$
DECLARE
  target RECORD;
BEGIN
  FOR target IN
    SELECT *
    FROM (VALUES
      ('flow', 'created_at', 'Asia/Shanghai', true),
      ('flow', 'started_at', 'Asia/Shanghai', true),
      ('flow', 'ended_at', 'Asia/Shanghai', false),
      ('flow', 'updated_at', 'Asia/Shanghai', true),
      ('flow_step', 'created_at', 'Asia/Shanghai', true),
      ('flow_step', 'updated_at', 'Asia/Shanghai', true),
      ('user_flow', 'created_at', 'Asia/Shanghai', true),
      ('user_flow', 'updated_at', 'Asia/Shanghai', true),
      ('email_batch', 'created_at', 'Asia/Shanghai', true),
      ('email_batch', 'updated_at', 'Asia/Shanghai', true),
      ('email_delivery', 'last_attempt_at', 'UTC', false),
      ('email_delivery', 'next_retry_at', 'UTC', false),
      ('email_delivery', 'dead_lettered_at', 'UTC', false),
      ('email_delivery', 'created_at', 'Asia/Shanghai', true),
      ('email_delivery', 'sent_at', 'UTC', false),
      ('email_delivery', 'updated_at', 'Asia/Shanghai', true),
      ('email_delivery_attempt', 'started_at', 'Asia/Shanghai', true),
      ('email_delivery_attempt', 'finished_at', 'UTC', false),
      ('email_send_rate_limit', 'window_start', 'UTC', false),
      ('email_send_rate_limit', 'updated_at', 'Asia/Shanghai', true),
      ('email_template_setting', 'updated_at', 'Asia/Shanghai', true),
      ('email_template_content', 'updated_at', 'Asia/Shanghai', true),
      ('user_point', 'created_at', 'Asia/Shanghai', true),
      ('user_oauth_account', 'access_token_expires_at', 'UTC', false),
      ('user_oauth_account', 'refresh_token_expires_at', 'UTC', false),
      ('user_oauth_account', 'created_at', 'Asia/Shanghai', true),
      ('user_oauth_account', 'updated_at', 'Asia/Shanghai', true),
      ('people_session', 'expires_at', 'UTC', false),
      ('people_session', 'link_access_token_expires_at', 'UTC', false),
      ('people_session', 'link_admin_access_token_expires_at', 'UTC', false),
      ('people_session', 'created_at', 'Asia/Shanghai', true),
      ('people_session', 'updated_at', 'Asia/Shanghai', true),
      ('interview_schedule', 'starts_at', 'UTC', false),
      ('interview_schedule', 'ends_at', 'UTC', false),
      ('interview_schedule', 'meeting_ended_at', 'UTC', false),
      ('interview_schedule', 'created_at', 'Asia/Shanghai', true),
      ('interview_schedule', 'updated_at', 'Asia/Shanghai', true),
      ('operation_audit', 'created_at', 'Asia/Shanghai', true),
      ('interview_schedule_cancellation_outbox', 'next_attempt_at', 'Asia/Shanghai', true),
      ('interview_schedule_cancellation_outbox', 'locked_until', 'UTC', false),
      ('interview_schedule_cancellation_outbox', 'last_attempt_at', 'UTC', false),
      ('interview_schedule_cancellation_outbox', 'published_at', 'UTC', false),
      ('interview_schedule_cancellation_outbox', 'created_at', 'Asia/Shanghai', true),
      ('interview_schedule_cancellation_outbox', 'updated_at', 'Asia/Shanghai', true),
      ('interview_evaluation', 'created_at', 'Asia/Shanghai', true),
      ('interview_evaluation', 'updated_at', 'Asia/Shanghai', true)
    ) AS values(table_name, column_name, source_timezone, restore_default)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = target.table_name
        AND column_name = target.column_name
        AND data_type = 'timestamp without time zone'
    ) THEN
      IF target.restore_default THEN
        EXECUTE format(
          'ALTER TABLE %I.%I ALTER COLUMN %I DROP DEFAULT',
          'public', target.table_name, target.column_name
        );
      END IF;

      EXECUTE format(
        'ALTER TABLE %I.%I ALTER COLUMN %I TYPE timestamptz USING %I AT TIME ZONE %L',
        'public', target.table_name, target.column_name,
        target.column_name, target.source_timezone
      );

      IF target.restore_default THEN
        EXECUTE format(
          'ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT now()',
          'public', target.table_name, target.column_name
        );
      END IF;
    END IF;
  END LOOP;
END $$;
