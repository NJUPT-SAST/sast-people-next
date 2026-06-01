-- One-time data migration for SAST People v3.
--
-- Purpose:
--   Replace legacy People user IDs in business tables with Link user IDs.
--
-- Expected input table:
--   people_legacy_user_map(legacy_user_id integer primary key, link_user_id integer not null unique)
--
-- Suggested import flow:
--   1. Export Link-side mapping to CSV with columns: legacy_user_id,link_user_id
--   2. Restore/copy the old People database into the new People v3 database.
--   3. Run migrations through 0011_link_user_ids.sql to drop local user foreign keys.
--   4. Create/import people_legacy_user_map in the People v3 database.
--   5. Run this script exactly once.

BEGIN;

CREATE TABLE IF NOT EXISTS people_legacy_user_map (
  legacy_user_id integer PRIMARY KEY,
  link_user_id integer NOT NULL UNIQUE
);

-- Uncomment and adjust when importing manually through psql:
-- \copy people_legacy_user_map(legacy_user_id, link_user_id) FROM './people_legacy_user_map.csv' WITH (FORMAT csv, HEADER true);

CREATE TABLE IF NOT EXISTS people_v3_migration_marker (
  name text PRIMARY KEY,
  applied_at timestamp NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM people_v3_migration_marker
    WHERE name = 'legacy_user_ids_to_link_user_ids'
  ) THEN
    RAISE EXCEPTION 'legacy_user_ids_to_link_user_ids has already been applied';
  END IF;
END $$;

DO $$
DECLARE
  missing_count integer;
BEGIN
  SELECT COUNT(*) INTO missing_count
  FROM (
    SELECT owner_id AS legacy_user_id FROM flow
    UNION
    SELECT fk_user_id FROM user_flow
    UNION
    SELECT fk_judger_id FROM user_point WHERE fk_judger_id IS NOT NULL
    UNION
    SELECT fk_user_id FROM interview_evaluation
    UNION
    SELECT fk_reviewed_by FROM interview_evaluation WHERE fk_reviewed_by IS NOT NULL
    UNION
    SELECT fk_created_by FROM email_batch WHERE fk_created_by IS NOT NULL
    UNION
    SELECT fk_user_id FROM email_delivery
  ) refs
  LEFT JOIN people_legacy_user_map m ON m.legacy_user_id = refs.legacy_user_id
  WHERE m.link_user_id IS NULL;

  IF missing_count > 0 THEN
    RAISE EXCEPTION 'Missing % legacy user id mappings; inspect the validation query before running updates', missing_count;
  END IF;
END $$;

UPDATE flow f
SET owner_id = m.link_user_id
FROM people_legacy_user_map m
WHERE f.owner_id = m.legacy_user_id;

UPDATE user_flow uf
SET fk_user_id = m.link_user_id
FROM people_legacy_user_map m
WHERE uf.fk_user_id = m.legacy_user_id;

UPDATE user_point up
SET fk_judger_id = m.link_user_id
FROM people_legacy_user_map m
WHERE up.fk_judger_id = m.legacy_user_id;

UPDATE interview_evaluation ie
SET fk_user_id = m.link_user_id
FROM people_legacy_user_map m
WHERE ie.fk_user_id = m.legacy_user_id;

UPDATE interview_evaluation ie
SET fk_reviewed_by = m.link_user_id
FROM people_legacy_user_map m
WHERE ie.fk_reviewed_by = m.legacy_user_id;

UPDATE email_batch eb
SET fk_created_by = m.link_user_id
FROM people_legacy_user_map m
WHERE eb.fk_created_by = m.legacy_user_id;

UPDATE email_delivery ed
SET fk_user_id = m.link_user_id
FROM people_legacy_user_map m
WHERE ed.fk_user_id = m.legacy_user_id;

INSERT INTO people_v3_migration_marker(name)
VALUES ('legacy_user_ids_to_link_user_ids');

COMMIT;

-- Optional post-run checks:
-- SELECT COUNT(*) AS mapped_users FROM people_legacy_user_map;
-- SELECT COUNT(*) AS user_flow_rows FROM user_flow;
-- SELECT COUNT(*) AS flow_rows FROM flow;
