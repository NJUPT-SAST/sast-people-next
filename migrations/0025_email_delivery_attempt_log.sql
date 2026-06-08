create table if not exists "email_delivery_attempt" (
  "id" serial primary key,
  "fk_email_delivery_id" integer not null,
  "trigger" varchar(32) default 'unknown' not null,
  "provider" varchar(32) default 'smtp' not null,
  "status" varchar(32) not null,
  "provider_message_id" varchar(255),
  "error_message" text,
  "triggered_by" integer,
  "started_at" timestamp default now() not null,
  "finished_at" timestamp,
  "duration_ms" integer
);

alter table "email_delivery_attempt" drop constraint if exists "email_delivery_attempt_fk_email_delivery_id_email_delivery_id_fk";
alter table "email_delivery_attempt" add constraint "email_delivery_attempt_fk_email_delivery_id_email_delivery_id_fk"
  foreign key ("fk_email_delivery_id") references "email_delivery"("id") on delete cascade;

create index if not exists "email_delivery_attempt_delivery_started_at_idx"
  on "email_delivery_attempt" ("fk_email_delivery_id", "started_at");

create index if not exists "email_delivery_attempt_status_started_at_idx"
  on "email_delivery_attempt" ("status", "started_at");

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'sastpeople') then
    grant select, insert, update, delete on table "public"."email_delivery_attempt" to "sastpeople";
    grant usage, select on sequence "public"."email_delivery_attempt_id_seq" to "sastpeople";
  end if;
end $$;
