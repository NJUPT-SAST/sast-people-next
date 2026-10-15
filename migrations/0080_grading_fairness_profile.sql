-- 阅卷公平性配置（每个流程一行）：全局校正强度 λ 与阅卷人人工权重。
-- 只影响「阅卷公平性分析」给出的参考分，不写回 user_point，也不影响官方成绩。
-- λ 为 0..1 的浮点（默认 0 = 只看不校）；judger_weights 为 阅卷人 ID → 0..2 的 jsonb 映射（默认空对象，未列出的讲师按 1 计）。

CREATE TABLE IF NOT EXISTS "grading_fairness_profile" (
  "id" serial PRIMARY KEY NOT NULL,
  "fk_flow_id" integer NOT NULL,
  "lambda" real DEFAULT 0 NOT NULL,
  "judger_weights" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "note" text,
  "updated_by" integer,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "grading_fairness_profile_fk_flow_id_unique" UNIQUE("fk_flow_id"),
  CONSTRAINT "grading_fairness_profile_flow_fk"
    FOREIGN KEY ("fk_flow_id")
    REFERENCES "public"."flow"("id")
    ON DELETE CASCADE
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sastpeople') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE "grading_fairness_profile" TO sastpeople;
    GRANT USAGE, SELECT
      ON SEQUENCE "grading_fairness_profile_id_seq" TO sastpeople;
  END IF;
END $$;
