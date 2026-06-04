-- ============================================
-- 0014: 修复邮件表外键策略 + 删除旧 email 表
-- ============================================
-- 1. 删除旧 email 表（死代码，v3.1 完全未使用）
-- 2. email_batch.fk_flow_id: NO ACTION → RESTRICT（防止误删有邮件记录的流程）
-- 3. email_delivery.fk_email_batch_id: NO ACTION → CASCADE（删批次时级联删除 delivery）
-- 4. email_delivery.fk_user_flow_id: NO ACTION (+ NOT NULL) → SET NULL（保留审计记录）

-- ============================================
-- Phase 1: 删除旧 email 表
-- ============================================

DROP TABLE IF EXISTS "email" CASCADE;

-- ============================================
-- Phase 2: email_batch FK → RESTRICT
-- ============================================

ALTER TABLE "email_batch" DROP CONSTRAINT IF EXISTS "email_batch_fk_flow_id_flow_id_fk";
ALTER TABLE "email_batch" ADD CONSTRAINT "email_batch_fk_flow_id_flow_id_fk"
  FOREIGN KEY ("fk_flow_id") REFERENCES "flow"("id") ON DELETE RESTRICT;

-- ============================================
-- Phase 3: email_delivery FK → CASCADE (batch)
-- ============================================

ALTER TABLE "email_delivery" DROP CONSTRAINT IF EXISTS "email_delivery_fk_email_batch_id_email_batch_id_fk";
ALTER TABLE "email_delivery" ADD CONSTRAINT "email_delivery_fk_email_batch_id_email_batch_id_fk"
  FOREIGN KEY ("fk_email_batch_id") REFERENCES "email_batch"("id") ON DELETE CASCADE;

-- ============================================
-- Phase 4: email_delivery FK → SET NULL (user_flow)
-- ============================================

-- SET NULL 要求列可为 NULL；先解锁
ALTER TABLE "email_delivery" ALTER COLUMN "fk_user_flow_id" DROP NOT NULL;

ALTER TABLE "email_delivery" DROP CONSTRAINT IF EXISTS "email_delivery_fk_user_flow_id_user_flow_id_fk";
ALTER TABLE "email_delivery" ADD CONSTRAINT "email_delivery_fk_user_flow_id_user_flow_id_fk"
  FOREIGN KEY ("fk_user_flow_id") REFERENCES "user_flow"("id") ON DELETE SET NULL;
