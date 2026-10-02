-- 部门权限隔离：部门归属落库到流程与报名记录，跨部门可见性收敛到管理员（Link admin）
-- flow.department                流程归属部门（NULL = 全局流程，仅管理员可见可改）
-- flow.group_departments         组别 → 部门 映射（部门内的组别，用于共享流程给候选人定部门）
-- user_flow.department           报名记录归属部门（报名时按 组别映射 → 流程归属 解析后固化）
-- operation_audit.department     操作审计归属部门（写入时按目标资源解析）
-- feedback_report.department     反馈归属部门（提交时按提交人部门解析）
ALTER TABLE "flow"
  ADD COLUMN IF NOT EXISTS "department" varchar(64),
  ADD COLUMN IF NOT EXISTS "group_departments" jsonb;

ALTER TABLE "user_flow"
  ADD COLUMN IF NOT EXISTS "department" varchar(64);

ALTER TABLE "operation_audit"
  ADD COLUMN IF NOT EXISTS "department" varchar(64);

ALTER TABLE "feedback_report"
  ADD COLUMN IF NOT EXISTS "department" varchar(64);

-- 会话缓存当前用户部门，避免每次请求都打 Link；由 dashboard 布局定期回源刷新
ALTER TABLE "people_session"
  ADD COLUMN IF NOT EXISTS "department" varchar(64),
  ADD COLUMN IF NOT EXISTS "department_synced_at" timestamptz;

CREATE INDEX IF NOT EXISTS "flow_department_idx"
  ON "flow" ("department", "is_deleted");

CREATE INDEX IF NOT EXISTS "user_flow_department_idx"
  ON "user_flow" ("department");

CREATE INDEX IF NOT EXISTS "operation_audit_department_idx"
  ON "operation_audit" ("department", "created_at");

CREATE INDEX IF NOT EXISTS "feedback_report_department_idx"
  ON "feedback_report" ("department");
