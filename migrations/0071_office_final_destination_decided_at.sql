-- 办公类「最终去向」改为当届有效：评议值只在这批流程的窗口内优先，决策之后新创建的流程
-- 一旦产生通过记录，就回到「最后一次通过覆盖」的自动规则（否则上一届的评议值会永远压过
-- 成员后来通过的部门，且界面上没有入口纠正已发布者的评议值）。
--
-- 存量行按最后的 updated_at 回填评议时刻，尽量贴近原决策时间；此后由设置动作写入，
-- 清除评议值（恢复自动归属）时一并置空。
ALTER TABLE "user_flow"
  ADD COLUMN IF NOT EXISTS "final_department_decided_at" timestamptz;

UPDATE "user_flow"
SET "final_department_decided_at" = "updated_at"
WHERE "final_department" IS NOT NULL
  AND "final_department_decided_at" IS NULL;
