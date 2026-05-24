-- Shift existing roles: 0 stays 0 (新同学), 1→2 (讲师), 2→3 (管理员)
-- New role 1 will be 部员
UPDATE "user" SET role = role + 1 WHERE role > 0;

-- Flow type enum and column
DO $$ BEGIN
  CREATE TYPE flow_type_enum AS ENUM ('recruitment', 'woc', 'soc');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "flow" ADD COLUMN IF NOT EXISTS "type" flow_type_enum NOT NULL DEFAULT 'recruitment';

-- Evaluation status enum
DO $$ BEGIN
  CREATE TYPE evaluation_status_enum AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Interview evaluation table
CREATE TABLE IF NOT EXISTS "interview_evaluation" (
  "id" serial PRIMARY KEY,
  "fk_user_flow_id" integer NOT NULL REFERENCES "user_flow"("id"),
  "fk_user_id" integer NOT NULL REFERENCES "user"("id"),
  "content" text NOT NULL,
  "status" evaluation_status_enum NOT NULL DEFAULT 'pending',
  "fk_reviewed_by" integer REFERENCES "user"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
