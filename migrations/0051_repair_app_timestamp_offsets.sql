-- Migration 0049 interpreted the legacy naive values in Asia/Shanghai.
-- The columns below were written as UTC ISO strings by Drizzle, so historical
-- rows were shifted eight hours early. Repair only rows that existed when 0049
-- was applied; values written after that migration are already timestamptz.
-- 0049's journal marker is 2026-08-29 11:33:36.490 UTC; verify it against
-- the target database before treating it as the repair cutoff.

DO $$
DECLARE
  migration_0049_marker bigint := 1788003216490;
  migration_0049_at timestamptz := to_timestamp(migration_0049_marker / 1000.0);
  migration_0049_hashes text[] := ARRAY[
    '31fd3663de9d7e44f7d095b9d15fba739f267dcfec07ec71fb44e71c2011bca3',
    '74dd9401283e4fc4297d10b887926b97f29e4f8362e35ae6cff32df2285bfe69'
  ];
  corrected_migration_0049_hash text :=
    'd0d1ae96348086869be9c3946d7455bdd6b5c2b1786ce72d993caa17a5fe5115';
  recorded_migration_0049_marker bigint;
  recorded_migration_0049_hash text;
BEGIN
  SELECT "hash", "created_at"
  INTO recorded_migration_0049_hash, recorded_migration_0049_marker
  FROM "drizzle"."__drizzle_migrations"
  WHERE "created_at" = migration_0049_marker
  ORDER BY "created_at" DESC
  LIMIT 1;

  IF recorded_migration_0049_hash = corrected_migration_0049_hash THEN
    RETURN;
  END IF;

  IF recorded_migration_0049_hash IS NULL
     OR recorded_migration_0049_hash <> ALL (migration_0049_hashes)
     OR recorded_migration_0049_marker IS DISTINCT FROM migration_0049_marker THEN
    RAISE EXCEPTION
      '0051 requires migration 0049 hash % and marker %, found hash % marker %',
      migration_0049_hashes,
      migration_0049_marker,
      recorded_migration_0049_hash,
      recorded_migration_0049_marker;
  END IF;

  UPDATE "email_delivery"
  SET
    "last_attempt_at" = "last_attempt_at" + interval '8 hours',
    "next_retry_at" = "next_retry_at" + interval '8 hours',
    "dead_lettered_at" = "dead_lettered_at" + interval '8 hours',
    "sent_at" = "sent_at" + interval '8 hours'
  WHERE "updated_at" < migration_0049_at
    AND (
      "last_attempt_at" IS NOT NULL
      OR "next_retry_at" IS NOT NULL
      OR "dead_lettered_at" IS NOT NULL
      OR "sent_at" IS NOT NULL
    );

  UPDATE "email_delivery_attempt" AS attempt
  SET "finished_at" = attempt."finished_at" + interval '8 hours'
  FROM "email_delivery" AS delivery
  WHERE attempt."fk_email_delivery_id" = delivery."id"
    AND attempt."finished_at" < migration_0049_at;

  UPDATE "email_send_rate_limit"
  SET "window_start" = "window_start" + interval '8 hours'
  WHERE "updated_at" < migration_0049_at;

  UPDATE "user_oauth_account"
  SET
    "access_token_expires_at" = "access_token_expires_at" + interval '8 hours',
    "refresh_token_expires_at" = "refresh_token_expires_at" + interval '8 hours'
  WHERE "updated_at" < migration_0049_at
    AND (
      "access_token_expires_at" IS NOT NULL
      OR "refresh_token_expires_at" IS NOT NULL
    );

  UPDATE "people_session"
  SET
    "expires_at" = "expires_at" + interval '8 hours',
    "link_access_token_expires_at" = "link_access_token_expires_at" + interval '8 hours',
    "link_admin_access_token_expires_at" = "link_admin_access_token_expires_at" + interval '8 hours'
  WHERE "created_at" < migration_0049_at
    AND (
      "expires_at" IS NOT NULL
      OR "link_access_token_expires_at" IS NOT NULL
      OR "link_admin_access_token_expires_at" IS NOT NULL
    );

  UPDATE "interview_schedule"
  SET
    "starts_at" = "starts_at" + interval '8 hours',
    "ends_at" = "ends_at" + interval '8 hours',
    "meeting_ended_at" = "meeting_ended_at" + interval '8 hours'
  WHERE "updated_at" < migration_0049_at;

  IF to_regclass('public.interview_schedule_cancellation_outbox') IS NOT NULL THEN
    UPDATE "interview_schedule_cancellation_outbox" AS outbox
    SET
      "locked_until" = "locked_until" + interval '8 hours',
      "last_attempt_at" = "last_attempt_at" + interval '8 hours',
      "published_at" = "published_at" + interval '8 hours'
    FROM "interview_schedule" AS schedule
    WHERE outbox."fk_interview_schedule_id" = schedule."id"
      AND outbox."updated_at" < migration_0049_at;
  END IF;
END $$;
