alter type "public"."email_delivery_status_enum" add value if not exists 'dead';

alter table "email_batch"
  add column if not exists "idempotency_key" varchar(160);

alter table "email_delivery"
  add column if not exists "idempotency_key" varchar(160),
  add column if not exists "next_retry_at" timestamp,
  add column if not exists "dead_lettered_at" timestamp;

with "computed_delivery_keys" as (
  select
    "delivery"."id",
    concat(
      'result:',
      coalesce("delivery"."fk_flow_id", "batch"."fk_flow_id"),
      ':',
      case
        when coalesce("delivery"."metadata"->>'accept', "batch"."accept"::text) = 'true'
          then 'accepted'
        else 'rejected'
      end,
      ':',
      "delivery"."fk_user_flow_id"
    ) as "computed_key",
    row_number() over (
      partition by
        coalesce("delivery"."fk_flow_id", "batch"."fk_flow_id"),
        coalesce("delivery"."metadata"->>'accept', "batch"."accept"::text),
        "delivery"."fk_user_flow_id"
      order by "delivery"."created_at", "delivery"."id"
    ) as "row_number"
  from "email_delivery" as "delivery"
  inner join "email_batch" as "batch"
    on "delivery"."fk_email_batch_id" = "batch"."id"
  where "delivery"."idempotency_key" is null
    and "delivery"."category" = 'result'
    and coalesce("delivery"."fk_flow_id", "batch"."fk_flow_id") is not null
    and coalesce("delivery"."metadata"->>'accept', "batch"."accept"::text) in ('true', 'false')
    and "delivery"."fk_user_flow_id" is not null
)
update "email_delivery"
set "idempotency_key" = "computed_delivery_keys"."computed_key"
from "computed_delivery_keys"
where "email_delivery"."id" = "computed_delivery_keys"."id"
  and "computed_delivery_keys"."row_number" = 1;

update "email_batch"
set "idempotency_key" = concat('legacy-result-batch:', "id")
where "idempotency_key" is null
  and "category" = 'result';

create unique index if not exists "email_batch_idempotency_key_uidx"
  on "email_batch" ("idempotency_key");

create unique index if not exists "email_delivery_idempotency_key_uidx"
  on "email_delivery" ("idempotency_key");

create index if not exists "email_delivery_retry_due_idx"
  on "email_delivery" ("status", "next_retry_at");

create index if not exists "email_delivery_provider_message_id_idx"
  on "email_delivery" ("provider_message_id");

create table if not exists "email_send_rate_limit" (
  "bucket_key" varchar(80) primary key,
  "window_start" timestamp not null,
  "count" integer default 0 not null,
  "updated_at" timestamp default now() not null
);

create index if not exists "email_send_rate_limit_window_start_idx"
  on "email_send_rate_limit" ("window_start");

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'sastpeople') then
    grant select, insert, update, delete on table "public"."email_send_rate_limit" to "sastpeople";
  end if;
end $$;
