-- 管理员可将不合规的面评退回给原讲师重写。
ALTER TYPE "evaluation_status_enum" ADD VALUE IF NOT EXISTS 'returned';

ALTER TABLE "interview_evaluation"
  ADD COLUMN IF NOT EXISTS "return_reason" text;
