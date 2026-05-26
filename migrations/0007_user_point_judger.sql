ALTER TABLE "user_point" ADD COLUMN IF NOT EXISTS "fk_judger_id" integer;

DO $$ BEGIN
  ALTER TABLE "user_point"
    ADD CONSTRAINT "user_point_fk_judger_id_user_id_fk"
    FOREIGN KEY ("fk_judger_id") REFERENCES "user"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
