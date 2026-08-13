-- Restore the user_flow relation for historical result deliveries. Before the
-- Link migration, some retained only the recipient user ID. The unique
-- (flow, user) relation makes this backfill deterministic.
UPDATE "email_delivery" AS "delivery"
SET "fk_user_flow_id" = "user_flow"."id"
FROM "email_batch" AS "batch", "user_flow"
WHERE "delivery"."fk_email_batch_id" = "batch"."id"
  AND "delivery"."category" = 'result'
  AND "delivery"."fk_user_flow_id" IS NULL
  AND "delivery"."fk_user_id" IS NOT NULL
  AND COALESCE("delivery"."fk_flow_id", "batch"."fk_flow_id") IS NOT NULL
  AND COALESCE("delivery"."metadata"->>'accept', "batch"."accept"::text) IN ('true', 'false')
  AND "user_flow"."fk_user_id" = "delivery"."fk_user_id"
  AND "user_flow"."fk_flow_id" = COALESCE("delivery"."fk_flow_id", "batch"."fk_flow_id");

-- The legacy compatibility lookup is scoped to deliveries without the modern
-- idempotency key, so it does not add write overhead to current mail traffic.
CREATE INDEX IF NOT EXISTS "email_delivery_legacy_result_recipient_idx"
  ON "email_delivery" ("fk_user_id")
  WHERE "category" = 'result' AND "idempotency_key" IS NULL;
