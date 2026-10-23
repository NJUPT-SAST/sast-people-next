-- 可复用的收集表模板（部长自建；内置成员/空白模板不落库）。
CREATE TABLE IF NOT EXISTS "collection_template" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(60) NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_by" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "collection_template_name_uidx" UNIQUE("name")
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sastpeople') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE "collection_template" TO sastpeople;
    GRANT USAGE, SELECT
      ON SEQUENCE "collection_template_id_seq" TO sastpeople;
  END IF;
END $$;

-- 收集表记录创建时使用的模板名（字段本身在 extra_fields）。
ALTER TABLE "collection_form"
  ADD COLUMN IF NOT EXISTS "template_name" varchar(60);

UPDATE "collection_form"
SET "template_name" = CASE
  WHEN "kind" = 'custom' THEN '自定义收集表'
  ELSE '社团成员信息收集表'
END
WHERE "template_name" IS NULL;

-- 历史成员收集表：把固定成员字段并入 extra_fields，之后所有表单统一按字段渲染与编辑。
UPDATE "collection_form"
SET "extra_fields" = '[
  {"id":"clubName","label":"社团名称","type":"text","required":false,"options":[],"fixedValue":"南京邮电大学大学生科学技术协会"},
  {"id":"category","label":"类别","type":"select","required":true,"options":["社长","副社长","部长","副部长","其他管理层","注册社员","其他"]},
  {"id":"name","label":"姓名","type":"text","required":true,"options":[],"prefillFrom":"name"},
  {"id":"birthMonth","label":"出生年月","type":"month","required":true,"options":[]},
  {"id":"politicalStatus","label":"政治面貌","type":"select","required":true,"options":["中共党员","中共预备党员","共青团员","群众","其他","民革会员","民盟盟员","民建会员","民进会员","农工党党员","致公党党员","九三学社社员","台盟盟员","无党派人士"]},
  {"id":"college","label":"所在学院","type":"text","required":true,"options":[],"prefillFrom":"college"},
  {"id":"className","label":"所在班级","type":"text","required":true,"options":[],"placeholder":"例如 B240101"},
  {"id":"studentId","label":"学号","type":"text","required":true,"options":[],"prefillFrom":"studentId"},
  {"id":"enrollmentYear","label":"入学年份","type":"number","required":true,"options":[]},
  {"id":"graduationYear","label":"预计毕业年份","type":"number","required":true,"options":[]}
]'::jsonb || "extra_fields"
WHERE "kind" = 'member'
  AND NOT ("extra_fields" @> '[{"id":"name"}]'::jsonb);

-- 历史提交：把固定列的值同步进 extra_answers，使动态渲染能读到旧数据。
UPDATE "collection_submission" AS s
SET "extra_answers" = jsonb_strip_nulls(
  jsonb_build_object(
    'clubName', s."club_name",
    'category', s."category",
    'name', s."name",
    'birthMonth', s."birth_month",
    'politicalStatus', s."political_status",
    'college', s."college",
    'className', s."class_name",
    'studentId', s."student_id",
    'enrollmentYear', CASE
      WHEN s."enrollment_year" IS NULL THEN NULL
      ELSE s."enrollment_year"::text
    END,
    'graduationYear', CASE
      WHEN s."graduation_year" IS NULL THEN NULL
      ELSE s."graduation_year"::text
    END
  )
) || s."extra_answers"
WHERE s."fk_form_id" IN (
  SELECT "id" FROM "collection_form" WHERE "kind" = 'member'
);
