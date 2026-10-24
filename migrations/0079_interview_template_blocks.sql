-- 面试通知模板也交给区块编辑：与 email_template_setting 同一套字段
-- （正文区块、邮件外框、主题色），渲染走同一套「外壳 + 区块」。
-- NULL / 空串 = 未自定义，渲染时回落内置版式与内置外观。

ALTER TABLE "email_template_content"
  ADD COLUMN IF NOT EXISTS "body_blocks" jsonb;

ALTER TABLE "email_template_content"
  ADD COLUMN IF NOT EXISTS "body_frame" jsonb;

ALTER TABLE "email_template_content"
  ADD COLUMN IF NOT EXISTS "theme_color" varchar(16) NOT NULL DEFAULT '';
