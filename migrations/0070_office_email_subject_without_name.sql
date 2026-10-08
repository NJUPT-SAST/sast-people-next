-- 办公类结果通知的邮件主题不再带候选人姓名（{name}{department}… → {department}…）。
--
-- 主题里带姓名时，邮件中心的「发送记录」与待发卡片会显示
-- 「张三办公室一轮面试结果通知」——每封投递各自带不同姓名，批次却只能存一个
-- 代表性主题，看起来像整批只发给某一个人，也与其他流程
-- （「2026 春季招新 结果通知」）的主题口径不一致。现在批次级主题与 {name} 解耦，
-- 个人化只保留在邮件正文的称呼里。
--
-- 内置默认同步去掉姓名；把仍是旧内置默认值的落库行改写为新文案，
-- 部门自定义过的主题保持原样。模板键与旧默认主题一一配对匹配：只有该键
-- 原本的默认文案才改写，键与文案的交叉组合（可能是管理员的自定义）不动。
UPDATE "email_template_setting"
SET "subject_template" = replace("subject_template", '{name}', '')
WHERE ("template_key", "subject_template") IN (
    ('office_round1.result.accepted', '{name}{department}一轮面试结果通知'),
    ('office_round1.result.rejected', '{name}{department}面试结果通知'),
    ('office_round2.result.accepted', '{name}{department}二轮面试结果通知'),
    ('office_round2.result.rejected', '{name}{department}面试结果通知')
  );
