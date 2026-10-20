-- 邮件外框可编辑：正文区块之外，页面背景、内容卡（背景/描边/圆角/宽度）、
-- logo、页眉眉标与页脚文案也交给模板自己决定。
-- NULL = 未自定义，渲染时回落到内置外观（lib/email/blocks.ts 的 DEFAULT_EMAIL_FRAME）。

ALTER TABLE "email_template_setting"
  ADD COLUMN IF NOT EXISTS "body_frame" jsonb;
