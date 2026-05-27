DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sastpeople') THEN
    GRANT USAGE ON TYPE "public"."email_batch_status_enum" TO "sastpeople";
    GRANT USAGE ON TYPE "public"."email_delivery_status_enum" TO "sastpeople";

    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."email_batch" TO "sastpeople";
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."email_delivery" TO "sastpeople";
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."email_template_setting" TO "sastpeople";

    GRANT USAGE, SELECT ON SEQUENCE "public"."email_batch_id_seq" TO "sastpeople";
    GRANT USAGE, SELECT ON SEQUENCE "public"."email_delivery_id_seq" TO "sastpeople";
    GRANT USAGE, SELECT ON SEQUENCE "public"."email_template_setting_id_seq" TO "sastpeople";
  END IF;
END $$;
