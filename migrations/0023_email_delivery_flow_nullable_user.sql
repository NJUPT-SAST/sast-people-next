alter table "email_delivery"
  add column if not exists "fk_flow_id" integer;

update "email_delivery"
set "fk_flow_id" = "email_batch"."fk_flow_id"
from "email_batch"
where "email_delivery"."fk_email_batch_id" = "email_batch"."id"
  and "email_delivery"."fk_flow_id" is null;

update "email_delivery"
set "fk_flow_id" = "user_flow"."fk_flow_id"
from "user_flow"
where "email_delivery"."fk_user_flow_id" = "user_flow"."id"
  and "email_delivery"."fk_flow_id" is null;

alter table "email_delivery"
  alter column "fk_user_id" drop not null;

alter table "email_delivery" drop constraint if exists "email_delivery_fk_flow_id_flow_id_fk";
alter table "email_delivery" add constraint "email_delivery_fk_flow_id_flow_id_fk"
  foreign key ("fk_flow_id") references "flow"("id") on delete restrict;

create index if not exists "email_delivery_created_at_idx"
  on "email_delivery" ("created_at");

create index if not exists "email_delivery_filter_idx"
  on "email_delivery" ("category", "template_key", "status");

create index if not exists "email_delivery_fk_flow_id_idx"
  on "email_delivery" ("fk_flow_id");
