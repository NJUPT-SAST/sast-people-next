-- 修正「切换身份查看」早期版本写下的审计角色。
--
-- PR #250 合并前的分支版本里，操作审计统一记录的是 `session.role`（临时视角的角色），
-- 于是管理员以「部长」视角浏览时做的操作在审计里显示为「部长」，与操作人实际权限等级矛盾；
-- 合并版（f1d9d5c）已改为记录 `session.realRole`，但那段窗口里写下的历史行仍是错的。
--
-- 只修正能被精确定位的行：同一位操作人在一次 `session.view-as.start`（metadata.role = 被模拟角色）
-- 到对应 `session.view-as.stop`（没有 stop 时按视角 cookie 的 12 小时有效期封顶）之间，
-- 且 `actor_role` 恰好等于被模拟角色的 user 记录——这些行只可能来自临时视角下的写入
-- （管理员真实角色是 4，不可能在这段时间里以真实身份写出角色 3 的记录）。
-- 修正值取同一窗口 start 行记录的真实角色；没有 start/stop 记录的历史数据不会被触碰。
WITH view_windows AS (
  SELECT
    start_row.actor_id,
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
      AND s.created_at > start_row.created_at
    ORDER BY s.created_at
    LIMIT 1
  ) stop_row ON true
  WHERE start_row.action = 'session.view-as.start'
    AND start_row.actor_type = 'user'
    AND start_row.actor_role IS NOT NULL
    AND (start_row.metadata ->> 'role') ~ '^[0-9]+$'
)
UPDATE "operation_audit" a
SET "actor_role" = w.real_role
FROM view_windows w
WHERE a.actor_id = w.actor_id
  AND a.actor_type = 'user'
  AND a.actor_role = w.viewed_role
  AND a.created_at >= w.window_start
  AND a.created_at <= w.window_end
  AND a.action NOT LIKE 'session.view-as.%';
