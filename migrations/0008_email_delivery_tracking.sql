CREATE TYPE "public"."email_batch_status_enum" AS ENUM('draft', 'queued', 'completed', 'failed');
CREATE TYPE "public"."email_delivery_status_enum" AS ENUM('pending', 'sending', 'sent', 'failed');

CREATE TABLE IF NOT EXISTS "email_batch" (
  "id" serial PRIMARY KEY NOT NULL,
  "template_key" varchar(80) NOT NULL,
  "subject" varchar(255) NOT NULL,
  "accept" boolean NOT NULL,
  "status" "email_batch_status_enum" DEFAULT 'draft' NOT NULL,
  "total_count" integer DEFAULT 0 NOT NULL,
  "fk_flow_id" integer NOT NULL,
  "fk_created_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "email_delivery" (
  "id" serial PRIMARY KEY NOT NULL,
  "to_address" varchar(254) NOT NULL,
  "subject" varchar(255) NOT NULL,
  "html_snapshot" text NOT NULL,
  "status" "email_delivery_status_enum" DEFAULT 'pending' NOT NULL,
  "error_message" text,
  "provider_message_id" varchar(255),
  "fk_email_batch_id" integer NOT NULL,
  "fk_user_flow_id" integer NOT NULL,
  "fk_user_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "sent_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "email_template_setting" (
  "id" serial PRIMARY KEY NOT NULL,
  "template_key" varchar(80) NOT NULL,
  "subject_template" varchar(255) NOT NULL,
  "member_info_form_url" text NOT NULL,
  "feishu_group_url" text NOT NULL,
  "calendar_url" text NOT NULL,
  "feishu_register_help_url" text NOT NULL,
  "contact_email" varchar(254) NOT NULL,
  "member_form_label" varchar(100) NOT NULL,
  "feishu_group_name" varchar(100) NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "email_template_setting_template_key_unique" UNIQUE("template_key")
);

DO $$ BEGIN
 ALTER TABLE "email_batch" ADD CONSTRAINT "email_batch_fk_flow_id_flow_id_fk" FOREIGN KEY ("fk_flow_id") REFERENCES "public"."flow"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "email_batch" ADD CONSTRAINT "email_batch_fk_created_by_user_id_fk" FOREIGN KEY ("fk_created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "email_delivery" ADD CONSTRAINT "email_delivery_fk_email_batch_id_email_batch_id_fk" FOREIGN KEY ("fk_email_batch_id") REFERENCES "public"."email_batch"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "email_delivery" ADD CONSTRAINT "email_delivery_fk_user_flow_id_user_flow_id_fk" FOREIGN KEY ("fk_user_flow_id") REFERENCES "public"."user_flow"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "email_delivery" ADD CONSTRAINT "email_delivery_fk_user_id_user_id_fk" FOREIGN KEY ("fk_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
