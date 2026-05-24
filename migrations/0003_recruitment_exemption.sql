-- Add recruitment_exemption (免试) flow type
DO $$ BEGIN
  ALTER TYPE flow_type_enum ADD VALUE 'recruitment_exemption';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
