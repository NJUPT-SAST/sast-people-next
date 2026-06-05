CREATE TABLE IF NOT EXISTS "email_template_content" (
  "id" serial PRIMARY KEY NOT NULL,
  "template_key" varchar(80) NOT NULL,
  "subject_template" varchar(255) NOT NULL,
  "title_template" varchar(255) NOT NULL,
  "body_template" text NOT NULL,
  "footer_text" varchar(255) NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "email_template_content_template_key_unique" UNIQUE("template_key")
);
