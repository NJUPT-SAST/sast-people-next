DO $$
DECLARE
  enum_type regtype;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sastpeople') THEN
    GRANT USAGE ON SCHEMA public TO sastpeople;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sastpeople;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sastpeople;

    FOR enum_type IN
      SELECT format('%I.%I', namespace.nspname, type.typname)::regtype
      FROM pg_type AS type
      INNER JOIN pg_namespace AS namespace ON namespace.oid = type.typnamespace
      WHERE namespace.nspname = 'public' AND type.typtype = 'e'
    LOOP
      EXECUTE format('GRANT USAGE ON TYPE %s TO sastpeople', enum_type);
    END LOOP;
  END IF;
END $$;
