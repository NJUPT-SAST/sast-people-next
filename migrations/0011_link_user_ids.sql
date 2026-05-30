DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT conrelid::regclass AS table_name, conname
    FROM pg_constraint
    WHERE contype = 'f'
      AND confrelid = 'public."user"'::regclass
      AND conrelid IN (
        'public.flow'::regclass,
        'public.user_flow'::regclass,
        'public.user_point'::regclass,
        'public.interview_evaluation'::regclass,
        'public.email_batch'::regclass,
        'public.email_delivery'::regclass
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I',
      fk.table_name,
      fk.conname
    );
  END LOOP;
END $$;
