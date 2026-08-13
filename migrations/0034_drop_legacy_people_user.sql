-- People no longer has a local identity source. The historical mapping table
-- remains for migration audit, but all runtime identity reads use SAST Link.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE contype = 'f'
      AND confrelid = to_regclass('public."user"')
  ) THEN
    RAISE EXCEPTION
      'Cannot drop public.user while foreign-key constraints still reference it';
  END IF;
END $$;

DROP TABLE IF EXISTS public."user";
