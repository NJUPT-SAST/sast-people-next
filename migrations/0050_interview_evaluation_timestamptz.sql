DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'interview_evaluation'
      AND column_name = 'created_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE "interview_evaluation"
      ALTER COLUMN "created_at" DROP DEFAULT,
      ALTER COLUMN "created_at" TYPE timestamptz
        USING "created_at" AT TIME ZONE 'Asia/Shanghai',
      ALTER COLUMN "created_at" SET DEFAULT now();
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'interview_evaluation'
      AND column_name = 'updated_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE "interview_evaluation"
      ALTER COLUMN "updated_at" DROP DEFAULT,
      ALTER COLUMN "updated_at" TYPE timestamptz
        USING "updated_at" AT TIME ZONE 'Asia/Shanghai',
      ALTER COLUMN "updated_at" SET DEFAULT now();
  END IF;
END $$;
