-- 面试流程允许同流程按组别独立投递：
-- 无组别（笔试/未配置）保持 (flow, user) 唯一；有组别改为 (flow, user, group) 唯一
ALTER TABLE "user_flow" DROP CONSTRAINT IF EXISTS "uq_user_flow_flow_user";

CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_flow_flow_user_no_group"
  ON "user_flow" ("fk_flow_id", "fk_user_id")
  WHERE "apply_group" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_flow_flow_user_group"
  ON "user_flow" ("fk_flow_id", "fk_user_id", "apply_group")
  WHERE "apply_group" IS NOT NULL;
