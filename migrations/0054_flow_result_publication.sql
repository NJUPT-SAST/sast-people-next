CREATE TABLE IF NOT EXISTS "flow_result_publication" (
  "id" serial PRIMARY KEY,
  "fk_flow_id" integer NOT NULL UNIQUE REFERENCES "flow"("id") ON DELETE RESTRICT,
  "status" varchar(32) NOT NULL DEFAULT 'publishing',
  "version" integer NOT NULL DEFAULT 1,
  "result_snapshot" jsonb NOT NULL,
  "template_snapshot" jsonb NOT NULL,
  "confirmed_by" integer,
  "confirmed_at" timestamptz,
  "published_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "flow_result_publication_status_idx"
  ON "flow_result_publication" ("status");
