DO $$
BEGIN
  CREATE TYPE "evaluation_recommendation_enum" AS ENUM ('passed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "interview_evaluation"
  ADD COLUMN IF NOT EXISTS "recommendation" "evaluation_recommendation_enum";
