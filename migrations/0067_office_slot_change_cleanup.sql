-- 办公类改期审批下线（改由部长在面试管理页直接调整时段）：
-- 候选人申请入口与部长审批入口都已去掉，存量 pending 申请直接关闭（保留记录，可追溯）。
--
-- 注意：枚举值比较沿用 0066 的 `"type"::text` 写法，避免同一事务里新枚举值未提交时报
-- 「unsafe use of new value ... of enum type flow_type_enum」。

UPDATE "interview_slot_change_request" r
SET "status" = 'rejected',
    "review_note" = '办公类改期审批已下线，改由部长在面试管理页直接调整时段',
    "reviewed_at" = now(),
    "updated_at" = now()
FROM "user_flow" uf
JOIN "flow" f ON f."id" = uf."fk_flow_id"
WHERE uf."id" = r."fk_user_flow_id"
  AND f."type"::text = 'office_interview'
  AND r."status" = 'pending';
