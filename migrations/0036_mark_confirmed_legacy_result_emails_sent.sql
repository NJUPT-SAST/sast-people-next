-- The two flows below were confirmed as having sent their result emails before
-- the email center existed. There are no matching email_delivery rows, so add
-- non-sendable historical records to prevent the center from offering them.
WITH "target_lanes" AS (
  SELECT
    "flow"."id" AS "flow_id",
    "flow"."title" AS "flow_title",
    "user_flow"."progress_status" = 'passed' AS "accept",
    COUNT(*) AS "total_count",
    COALESCE("flow"."ended_at", "flow"."created_at") AS "historical_sent_at"
  FROM "flow"
  INNER JOIN "user_flow"
    ON "user_flow"."fk_flow_id" = "flow"."id"
  WHERE "flow"."id" IN (9, 10)
    AND "user_flow"."progress_status" IN ('passed', 'failed')
  GROUP BY
    "flow"."id",
    "flow"."title",
    "user_flow"."progress_status",
    "flow"."ended_at",
    "flow"."created_at"
)
INSERT INTO "email_batch" (
  "idempotency_key",
  "template_key",
  "category",
  "name",
  "subject",
  "accept",
  "status",
  "total_count",
  "fk_flow_id",
  "metadata",
  "created_at"
)
SELECT
  CONCAT('legacy-result-suppressed-batch:', "flow_id", ':', "accept"),
  'legacy',
  'result',
  CONCAT("flow_title", ' 历史结果通知'),
  CONCAT("flow_title", ' 结果通知'),
  "accept",
  'completed',
  "total_count",
  "flow_id",
  jsonb_build_object(
    'legacyMarkedSent', true,
    'synthetic', true,
    'reason', 'confirmed sent before email center'
  ),
  "historical_sent_at"
FROM "target_lanes"
ON CONFLICT ("idempotency_key") DO UPDATE
SET
  "status" = 'completed',
  "total_count" = EXCLUDED."total_count",
  "updated_at" = CURRENT_TIMESTAMP;

-- Every historical user-flow receives an explicit sent delivery. The invalid
-- address is deliberate: this is archival state only and will never be queued.
INSERT INTO "email_delivery" (
  "idempotency_key",
  "category",
  "template_key",
  "to_address",
  "subject",
  "html_snapshot",
  "status",
  "fk_email_batch_id",
  "fk_flow_id",
  "fk_user_flow_id",
  "fk_user_id",
  "metadata",
  "created_at",
  "sent_at"
)
SELECT
  CONCAT('legacy-result-suppressed-delivery:', "user_flow"."id"),
  'result',
  'legacy',
  CONCAT('legacy-', "user_flow"."fk_user_id", '@invalid.local'),
  "batch"."subject",
  '<p>历史结果通知：该记录在邮件中心上线前已发送。</p>',
  'sent',
  "batch"."id",
  "flow"."id",
  "user_flow"."id",
  "user_flow"."fk_user_id",
  jsonb_build_object(
    'legacyMarkedSent', true,
    'synthetic', true,
    'reason', 'confirmed sent before email center'
  ),
  COALESCE("flow"."ended_at", "flow"."created_at"),
  COALESCE("flow"."ended_at", "flow"."created_at")
FROM "flow"
INNER JOIN "user_flow"
  ON "user_flow"."fk_flow_id" = "flow"."id"
INNER JOIN "email_batch" AS "batch"
  ON "batch"."fk_flow_id" = "flow"."id"
  AND "batch"."accept" = ("user_flow"."progress_status" = 'passed')
  AND "batch"."idempotency_key" = CONCAT(
    'legacy-result-suppressed-batch:',
    "flow"."id",
    ':',
    ("user_flow"."progress_status" = 'passed')
  )
WHERE "flow"."id" IN (9, 10)
  AND "user_flow"."progress_status" IN ('passed', 'failed')
  AND NOT EXISTS (
    SELECT 1
    FROM "email_delivery" AS "existing"
    WHERE "existing"."fk_user_flow_id" = "user_flow"."id"
      AND "existing"."category" = 'result'
  )
ON CONFLICT ("idempotency_key") DO UPDATE
SET
  "status" = 'sent',
  "sent_at" = COALESCE("email_delivery"."sent_at", EXCLUDED."sent_at"),
  "updated_at" = CURRENT_TIMESTAMP;
