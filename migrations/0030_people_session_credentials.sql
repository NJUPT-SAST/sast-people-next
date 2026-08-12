CREATE TABLE "people_session" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "uid" integer NOT NULL,
  "name" varchar(30) NOT NULL,
  "role" integer NOT NULL,
  "expires_at" timestamp NOT NULL,
  "link_access_token" text,
  "link_refresh_token" text,
  "link_access_token_expires_at" timestamp,
  "link_admin_access_token" text,
  "link_admin_refresh_token" text,
  "link_admin_access_token_expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "people_session_expires_at_idx"
  ON "people_session" ("expires_at");

CREATE INDEX "people_session_uid_idx"
  ON "people_session" ("uid");
