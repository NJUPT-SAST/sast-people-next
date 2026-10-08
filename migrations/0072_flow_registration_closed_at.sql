-- 办公类部门面试招新：一面名单确认后，这个流程不再接受新报名——晚来的报名没有一面可以参加。
-- flow.registration_closed_at = 报名截止时间（由「确认一面」写入；NULL = 未截止）：
-- 报名入口据此把流程置灰并标注「报名已截止」，服务端 register 同样拒绝。
ALTER TABLE "flow"
  ADD COLUMN IF NOT EXISTS "registration_closed_at" timestamptz;

-- 存量回填：已经确认过一面的办公类流程（有人进入二面，或有人止步于一面）视为报名已截止。
-- 枚举列一律用 ::text 比较（新库同事务执行全部迁移时，新枚举值尚未提交）。
UPDATE "flow" f
SET "registration_closed_at" = now()
WHERE f."type"::text = 'office_interview'
  AND f."registration_closed_at" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "user_flow" uf
    WHERE uf."fk_flow_id" = f."id"
      AND (
        uf."round" = 2
        OR (uf."progress_status"::text = 'failed' AND uf."round" = 1)
      )
  );
