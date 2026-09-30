-- 办公类部门面试招新改为「每个办公部门一条独立流程」：
-- * flow.department = 办公部门（不再有 department IS NULL 的共享办公流程），权限/邮件/发布各归本部门；
-- * user_flow.choice：1=第一志愿、2=第二志愿（候选人在两个部门流程分别报名）；
-- * user_flow.final_department：部长团评议的最终去向部门（为空时按「第一志愿优先」自动归属）；
-- * 取消办公部门互斥，改为「最多两条进行中的办公类报名，且一志愿/二志愿各最多一条」；
-- * 存量共享流程按 group_departments 拆分：第一志愿报名搬进对应部门流程，
--   第二志愿补一条 choice=2 的报名记录（保留报名时间），共享流程归档保留历史外键。

ALTER TABLE "user_flow" ADD COLUMN IF NOT EXISTS "choice" smallint;
ALTER TABLE "user_flow" ADD COLUMN IF NOT EXISTS "final_department" varchar(64);

DO $$
DECLARE
  shared_flow RECORD;
  dept RECORD;
  target_flow_id INTEGER;
  signup_step_id INTEGER;
  reg RECORD;
BEGIN
  CREATE TEMP TABLE office_dept_seed (dept_key TEXT PRIMARY KEY, label TEXT) ON COMMIT DROP;

  /* 部门清单：共享流程的 group_departments + 存量报名里出现过的第一/第二志愿部门 */
  INSERT INTO office_dept_seed (dept_key, label)
  SELECT DISTINCT value, key
  FROM "flow" f, jsonb_each_text(COALESCE(f."group_departments", '{}'::jsonb))
  WHERE f."type" = 'office_interview' AND f."department" IS NULL
  ON CONFLICT (dept_key) DO NOTHING;

  INSERT INTO office_dept_seed (dept_key, label)
  SELECT DISTINCT uf."department", uf."department"
  FROM "user_flow" uf
  JOIN "flow" f ON f."id" = uf."fk_flow_id"
  WHERE f."type" = 'office_interview' AND f."department" IS NULL
    AND uf."department" IS NOT NULL
  ON CONFLICT (dept_key) DO NOTHING;

  INSERT INTO office_dept_seed (dept_key, label)
  SELECT DISTINCT uf."second_choice_department", uf."second_choice_department"
  FROM "user_flow" uf
  JOIN "flow" f ON f."id" = uf."fk_flow_id"
  WHERE f."type" = 'office_interview' AND f."department" IS NULL
    AND uf."second_choice_department" IS NOT NULL
  ON CONFLICT (dept_key) DO NOTHING;

  /* 1) 每个办公部门一条流程：沿用共享流程的标题/描述/时间/面试时段与步骤 */
  FOR shared_flow IN
    SELECT * FROM "flow"
    WHERE "type" = 'office_interview' AND "department" IS NULL AND "is_deleted" = false
  LOOP
    FOR dept IN SELECT * FROM office_dept_seed
    LOOP
      SELECT "id" INTO target_flow_id FROM "flow"
        WHERE "type" = 'office_interview' AND "department" = dept.dept_key AND "is_deleted" = false
        ORDER BY "id" LIMIT 1;

      IF target_flow_id IS NULL THEN
        INSERT INTO "flow"
          ("title", "description", "type", "owner_id", "started_at", "ended_at", "department", "slot_options")
        VALUES (
          COALESCE(shared_flow."title", '办公类部门面试招新') || '（' || dept.label || '）',
          shared_flow."description",
          'office_interview',
          shared_flow."owner_id",
          shared_flow."started_at",
          shared_flow."ended_at",
          dept.dept_key,
          shared_flow."slot_options"
        )
        RETURNING "id" INTO target_flow_id;

        INSERT INTO "flow_step" ("title", "description", "type", "order", "fk_flow_id", "is_deleted")
        SELECT "title", "description", "type", "order", target_flow_id, false
        FROM "flow_step"
        WHERE "fk_flow_id" = shared_flow."id" AND "is_deleted" = false;
      END IF;
    END LOOP;

    /* 2) 第一志愿报名搬进对应部门流程 */
    FOR reg IN
      SELECT * FROM "user_flow" WHERE "fk_flow_id" = shared_flow."id"
    LOOP
      SELECT "id" INTO target_flow_id FROM "flow"
        WHERE "type" = 'office_interview' AND "department" = reg."department" AND "is_deleted" = false
        ORDER BY "id" LIMIT 1;

      IF target_flow_id IS NOT NULL THEN
        SELECT "id" INTO signup_step_id FROM "flow_step"
          WHERE "fk_flow_id" = target_flow_id AND "order" = 1 AND "is_deleted" = false
          ORDER BY "id" LIMIT 1;

        UPDATE "user_flow"
          SET "fk_flow_id" = target_flow_id,
              "choice" = COALESCE("choice", 1),
              "fk_current_step_id" = COALESCE("fk_current_step_id", signup_step_id)
          WHERE "id" = reg."id";
      END IF;
    END LOOP;
  END LOOP;

  /* 3) 第二志愿补一条记录（目标部门流程里已有该用户报名时跳过） */
  FOR reg IN
    SELECT uf.* FROM "user_flow" uf
    JOIN "flow" f ON f."id" = uf."fk_flow_id"
    WHERE f."type" = 'office_interview'
      AND uf."second_choice_department" IS NOT NULL
  LOOP
    SELECT "id" INTO target_flow_id FROM "flow"
      WHERE "type" = 'office_interview' AND "department" = reg."second_choice_department" AND "is_deleted" = false
      ORDER BY "id" LIMIT 1;

    IF target_flow_id IS NOT NULL AND target_flow_id <> reg."fk_flow_id" THEN
      SELECT "id" INTO signup_step_id FROM "flow_step"
        WHERE "fk_flow_id" = target_flow_id AND "order" = 1 AND "is_deleted" = false
        ORDER BY "id" LIMIT 1;

      INSERT INTO "user_flow"
        ("progress_status", "choice", "round", "fk_current_step_id", "fk_flow_id", "fk_user_id", "department", "created_at", "updated_at")
      SELECT 'ongoing', 2, 1, signup_step_id, target_flow_id, reg."fk_user_id", reg."second_choice_department", reg."created_at", now()
      WHERE NOT EXISTS (
        SELECT 1 FROM "user_flow" other
        WHERE other."fk_flow_id" = target_flow_id AND other."fk_user_id" = reg."fk_user_id"
      );
    END IF;
  END LOOP;

  /* 4) 共享流程归档：保留历史邮件批次/发布记录的外键 */
  UPDATE "flow" SET "is_deleted" = true
    WHERE "type" = 'office_interview' AND "department" IS NULL;
END $$;

ALTER TABLE "user_flow" DROP COLUMN IF EXISTS "second_choice_department";
