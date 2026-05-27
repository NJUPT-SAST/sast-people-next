DO $$ BEGIN
  ALTER TABLE "user_point" ADD COLUMN IF NOT EXISTS "fk_judger_id" integer;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_point_fk_judger_id_user_id_fk'
  ) THEN
    ALTER TABLE "user_point"
      ADD CONSTRAINT "user_point_fk_judger_id_user_id_fk"
      FOREIGN KEY ("fk_judger_id") REFERENCES "user"("id");
  END IF;
END $$;
