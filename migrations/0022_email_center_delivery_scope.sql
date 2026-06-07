alter table "email_batch"
  add column if not exists "category" varchar(32) not null default 'result',
  add column if not exists "name" varchar(255),
  add column if not exists "metadata" jsonb;

alter table "email_batch"
  alter column "accept" drop not null,
  alter column "fk_flow_id" drop not null;

alter table "email_delivery"
  add column if not exists "category" varchar(32) not null default 'result',
  add column if not exists "template_key" varchar(80) not null default 'legacy',
  add column if not exists "related_schedule_id" integer,
  add column if not exists "created_by" integer,
  add column if not exists "metadata" jsonb;

update "email_delivery"
set "template_key" = "email_batch"."template_key"
from "email_batch"
where "email_delivery"."fk_email_batch_id" = "email_batch"."id";

alter table "email_delivery"
  alter column "fk_email_batch_id" drop not null;

alter table "email_delivery" drop constraint if exists "email_delivery_related_schedule_id_interview_schedule_id_fk";
alter table "email_delivery" add constraint "email_delivery_related_schedule_id_interview_schedule_id_fk"
  foreign key ("related_schedule_id") references "interview_schedule"("id") on delete set null;
