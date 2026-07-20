-- ============================================
-- 0013: 修复数据库设计问题
-- ============================================
-- 1. flow.ended_at: 语义修正 — 创建时不应有默认值，未结束时为 NULL
-- 2. flow_step: UNIQUE(fk_flow_id, order) + FK CASCADE
-- 3. user_flow: 去重 + UNIQUE(fk_flow_id, fk_user_id) + 时间戳 + FK CASCADE
-- 4. problem: FK CASCADE
-- 5. user_point: 时间戳 + FK CASCADE
-- 6. interview_evaluation: FK CASCADE
-- 7. user_flow: status → progress_status（报名无需审核，去掉 registration_status）
-- 8. user_flow: current_step_order → fk_current_step_id (FK → flow_step)

-- ============================================
-- Phase 1: 清理 user_flow 重复数据
-- ============================================

DELETE FROM "user_point" WHERE "fk_user_flow_id" IN (
  SELECT a.id FROM "user_flow" a
  JOIN "user_flow" b ON a."fk_flow_id" = b."fk_flow_id" AND a."fk_user_id" = b."fk_user_id" AND a.id < b.id
);

DELETE FROM "interview_evaluation" WHERE "fk_user_flow_id" IN (
  SELECT a.id FROM "user_flow" a
  JOIN "user_flow" b ON a."fk_flow_id" = b."fk_flow_id" AND a."fk_user_id" = b."fk_user_id" AND a.id < b.id
);

DELETE FROM "email_delivery" WHERE "fk_user_flow_id" IN (
  SELECT a.id FROM "user_flow" a
  JOIN "user_flow" b ON a."fk_flow_id" = b."fk_flow_id" AND a."fk_user_id" = b."fk_user_id" AND a.id < b.id
);

DELETE FROM "user_flow" a
USING "user_flow" b
WHERE a."fk_flow_id" = b."fk_flow_id"
  AND a."fk_user_id" = b."fk_user_id"
  AND a.id < b.id;

-- ============================================
-- Phase 2: 新枚举
-- ============================================

DO $$ BEGIN
  CREATE TYPE "progress_status_enum" AS ENUM ('not_started', 'ongoing', 'passed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- Phase 3: 结构变更
-- ============================================

-- flow.ended_at: 去掉 NOT NULL 和默认值
ALTER TABLE "flow" ALTER COLUMN "ended_at" DROP DEFAULT;
ALTER TABLE "flow" ALTER COLUMN "ended_at" DROP NOT NULL;

-- flow_step: 唯一约束
ALTER TABLE "flow_step" ADD CONSTRAINT "uq_flow_step_flow_order" UNIQUE ("fk_flow_id", "order");

-- flow_step FK → CASCADE
ALTER TABLE "flow_step" DROP CONSTRAINT IF EXISTS "flow_step_fk_flow_id_flow_id_fk";
ALTER TABLE "flow_step" ADD CONSTRAINT "flow_step_fk_flow_id_flow_id_fk"
  FOREIGN KEY ("fk_flow_id") REFERENCES "flow"("id") ON DELETE CASCADE;

-- user_flow: 时间戳
ALTER TABLE "user_flow" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now() NOT NULL;
ALTER TABLE "user_flow" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;

-- user_flow: 唯一约束
ALTER TABLE "user_flow" ADD CONSTRAINT "uq_user_flow_flow_user" UNIQUE ("fk_flow_id", "fk_user_id");

-- user_flow FK → CASCADE
ALTER TABLE "user_flow" DROP CONSTRAINT IF EXISTS "user_flow_fk_flow_id_flow_id_fk";
ALTER TABLE "user_flow" ADD CONSTRAINT "user_flow_fk_flow_id_flow_id_fk"
  FOREIGN KEY ("fk_flow_id") REFERENCES "flow"("id") ON DELETE CASCADE;

-- problem FK → CASCADE
ALTER TABLE "problem" DROP CONSTRAINT IF EXISTS "problem_fk_flow_step_id_flow_step_id_fk";
ALTER TABLE "problem" ADD CONSTRAINT "problem_fk_flow_step_id_flow_step_id_fk"
  FOREIGN KEY ("fk_flow_step_id") REFERENCES "flow_step"("id") ON DELETE CASCADE;

-- user_point: 时间戳
ALTER TABLE "user_point" ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT now() NOT NULL;

-- user_point FK → CASCADE
ALTER TABLE "user_point" DROP CONSTRAINT IF EXISTS "user_point_fk_user_flow_id_user_flow_id_fk";
ALTER TABLE "user_point" ADD CONSTRAINT "user_point_fk_user_flow_id_user_flow_id_fk"
  FOREIGN KEY ("fk_user_flow_id") REFERENCES "user_flow"("id") ON DELETE CASCADE;

ALTER TABLE "user_point" DROP CONSTRAINT IF EXISTS "user_point_fk_problem_id_problem_id_fk";
ALTER TABLE "user_point" ADD CONSTRAINT "user_point_fk_problem_id_problem_id_fk"
  FOREIGN KEY ("fk_problem_id") REFERENCES "problem"("id") ON DELETE CASCADE;

-- interview_evaluation FK → CASCADE
ALTER TABLE "interview_evaluation" DROP CONSTRAINT IF EXISTS "interview_evaluation_fk_user_flow_id_user_flow_id_fk";
ALTER TABLE "interview_evaluation" ADD CONSTRAINT "interview_evaluation_fk_user_flow_id_user_flow_id_fk"
  FOREIGN KEY ("fk_user_flow_id") REFERENCES "user_flow"("id") ON DELETE CASCADE;

-- ============================================
-- Phase 4: user_flow 状态迁移 + 步骤引用改造
-- ============================================

ALTER TABLE "user_flow" ADD COLUMN "progress_status" "progress_status_enum";
ALTER TABLE "user_flow" ADD COLUMN "fk_current_step_id" integer;

-- 数据迁移: status → progress_status
-- 报名无需审核；旧 accepted 表示已通过并已授予角色，必须保留为 passed
UPDATE "user_flow" SET
  "progress_status" = CASE
    WHEN "status" = 'pending'  THEN 'not_started'::"progress_status_enum"
    WHEN "status" = 'accepted' THEN 'passed'::"progress_status_enum"
    WHEN "status" = 'rejected' THEN 'failed'::"progress_status_enum"
    WHEN "status" = 'ongoing'  THEN 'ongoing'::"progress_status_enum"
    -- Drizzle replays pending migrations in one transaction; values added by
    -- 0006 must be compared as text until that transaction has committed.
    WHEN "status"::text = 'passed' THEN 'passed'::"progress_status_enum"
    WHEN "status"::text = 'failed' THEN 'failed'::"progress_status_enum"
  END;

-- current_step_order → fk_current_step_id
UPDATE "user_flow" uf SET "fk_current_step_id" = fs."id"
FROM "flow_step" fs
WHERE fs."fk_flow_id" = uf."fk_flow_id" AND fs."order" = uf."current_step_order";

-- fk_current_step_id FK 约束
ALTER TABLE "user_flow" ADD CONSTRAINT "user_flow_fk_current_step_id_flow_step_id_fk"
  FOREIGN KEY ("fk_current_step_id") REFERENCES "flow_step"("id") ON DELETE SET NULL;

-- 删除旧列
ALTER TABLE "user_flow" DROP COLUMN "status";
ALTER TABLE "user_flow" DROP COLUMN "current_step_order";

-- 删除旧枚举
DROP TYPE "user_flow_status_enum";
