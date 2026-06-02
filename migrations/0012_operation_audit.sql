CREATE TABLE IF NOT EXISTS "operation_audit" (
  "id" serial PRIMARY KEY NOT NULL,
  "actor_id" integer NOT NULL,
  "action" varchar(80) NOT NULL,
  "resource_type" varchar(80) NOT NULL,
  "resource_id" integer,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "operation_audit_actor_id_idx"
  ON "operation_audit" ("actor_id");

CREATE INDEX IF NOT EXISTS "operation_audit_resource_idx"
  ON "operation_audit" ("resource_type", "resource_id");

CREATE INDEX IF NOT EXISTS "operation_audit_created_at_idx"
  ON "operation_audit" ("created_at");
