alter table "email_delivery"
  add column if not exists "attempt_count" integer not null default 0,
  add column if not exists "last_attempt_at" timestamp;

create index if not exists "email_delivery_attempt_status_idx"
  on "email_delivery" ("status", "last_attempt_at");
