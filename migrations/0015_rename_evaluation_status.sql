-- ============================================
-- 0015: 面评状态语义修正
-- ============================================
-- evaluation_status_enum: pending → submitted
-- "pending" 语义模糊（讲师还没写？还是讲师写了等终审？）
-- "submitted" 明确表示：讲师已提交面评，等待管理员终审

ALTER TYPE "evaluation_status_enum" RENAME VALUE 'pending' TO 'submitted';

-- 没有面评记录 = 讲师尚未初审/提交
-- submitted      = 讲师已提交面评，等待管理员终审
-- approved       = 管理员终审通过
-- rejected       = 管理员终审驳回
