-- 修正「切换身份查看」早期版本写下的审计角色。
--
-- PR #250 合并前的分支版本里，操作审计统一记录的是 `session.role`（临时视角的角色），
-- 于是管理员以「部长」视角浏览时做的操作在审计里显示为「部长」，与操作人实际权限等级矛盾；
-- 合并版（f1d9d5c）已改为记录 `session.realRole`，但那段窗口里写下的历史行仍是错的。
--
-- 只修正 actor_id 和 metadata.sessionId 均匹配的会话窗口与操作行。
-- sessionId 必须是非空字符串；早期写入器未记录它，因此这些历史行会被跳过，
-- 本迁移不代表缺少会话标识的历史数据已完整修正，不能用 actor_id 或 resource_id 猜测会话。
-- 窗口从 start 到同一会话的 stop；没有 stop 时按视角 cookie 的 12 小时有效期封顶。
-- 仅将窗口内等于被模拟角色的 user 记录修正为 start 行记录的真实角色。
WITH view_windows AS (
  SELECT
    start_row.actor_id,
    start_row.metadata ->> 'sessionId' AS session_id,
    (start_row.metadata ->> 'role')::int AS viewed_role,
    start_row.actor_role AS real_role,
    start_row.created_at AS window_start,
    LEAST(
      COALESCE(stop_row.created_at, start_row.created_at + interval '12 hours'),
      start_row.created_at + interval '12 hours'
    ) AS window_end
  FROM "operation_audit" start_row
  LEFT JOIN LATERAL (
    SELECT s.created_at
    FROM "operation_audit" s
    WHERE s.actor_id = start_row.actor_id
      AND s.action = 'session.view-as.stop'
      AND s.actor_type = 'user'
      AND s.metadata -> 'sessionId' = start_row.metadata -> 'sessionId'
      AND s.created_at > start_row.created_at
    ORDER BY s.created_at
    LIMIT 1
  ) stop_row ON true
  WHERE start_row.action = 'session.view-as.start'
    AND start_row.actor_type = 'user'
    AND start_row.actor_role IS NOT NULL
    AND jsonb_typeof(start_row.metadata -> 'sessionId') = 'string'
    AND btrim(start_row.metadata ->> 'sessionId') <> ''
    AND (start_row.metadata ->> 'role') ~ '^[0-9]+$'
)
UPDATE "operation_audit" a
SET "actor_role" = w.real_role
FROM view_windows w
WHERE a.actor_id = w.actor_id
  AND a.actor_type = 'user'
  AND a.metadata -> 'sessionId' = to_jsonb(w.session_id)
  AND a.actor_role = w.viewed_role
  AND a.created_at >= w.window_start
  AND a.created_at <= w.window_end
  AND (a.action NOT LIKE 'session.view-as.%' OR a.action = 'session.view-as.stop');
