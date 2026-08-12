-- Support the high-frequency dashboard lookups that join People business data
-- to Link identities without scanning the full related table.
CREATE INDEX IF NOT EXISTS "user_flow_fk_user_id_idx"
  ON "user_flow" ("fk_user_id");

CREATE INDEX IF NOT EXISTS "interview_evaluation_user_flow_status_idx"
  ON "interview_evaluation" ("fk_user_flow_id", "status");

CREATE INDEX IF NOT EXISTS "email_delivery_batch_created_at_idx"
  ON "email_delivery" ("fk_email_batch_id", "created_at");
