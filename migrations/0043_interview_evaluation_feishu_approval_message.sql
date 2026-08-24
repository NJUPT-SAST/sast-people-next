ALTER TABLE "interview_evaluation"
  ADD COLUMN IF NOT EXISTS "feishu_approval_message_id" varchar(255);
