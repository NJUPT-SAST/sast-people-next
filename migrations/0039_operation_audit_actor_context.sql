ALTER TABLE "operation_audit"
  ADD COLUMN IF NOT EXISTS "actor_role" integer,
  ADD COLUMN IF NOT EXISTS "actor_type" varchar(32) NOT NULL DEFAULT 'user';
