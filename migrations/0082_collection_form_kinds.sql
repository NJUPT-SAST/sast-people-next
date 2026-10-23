-- 收集表模板：member（固定成员字段，默认/历史数据）或 custom（只用自定义收集项）。
ALTER TABLE "collection_form"
  ADD COLUMN IF NOT EXISTS "kind" varchar(16) DEFAULT 'member' NOT NULL;

-- 自定义表不填写固定成员字段，这些列改为可空；member 表的写入路径仍然完整校验。
ALTER TABLE "collection_submission"
  ALTER COLUMN "club_name" DROP NOT NULL,
  ALTER COLUMN "category" DROP NOT NULL,
  ALTER COLUMN "name" DROP NOT NULL,
  ALTER COLUMN "birth_month" DROP NOT NULL,
  ALTER COLUMN "political_status" DROP NOT NULL,
  ALTER COLUMN "college" DROP NOT NULL,
  ALTER COLUMN "class_name" DROP NOT NULL,
  ALTER COLUMN "student_id" DROP NOT NULL,
  ALTER COLUMN "enrollment_year" DROP NOT NULL,
  ALTER COLUMN "graduation_year" DROP NOT NULL;

-- 部长退回填写：记录退回时间与说明，填写人重新提交时清空。
ALTER TABLE "collection_submission"
  ADD COLUMN IF NOT EXISTS "returned_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "return_note" text;
