insert into "user" (
  id,
  name,
  student_id,
  email,
  phone,
  role,
  created_at,
  updated_at,
  is_deleted
) values (
  1,
  'Local Admin',
  '001',
  'admin@njupt.edu.cn',
  '13800001111',
  3,
  now(),
  now(),
  false
) on conflict (id) do update set
  name = excluded.name,
  student_id = excluded.student_id,
  email = excluded.email,
  phone = excluded.phone,
  role = excluded.role,
  is_deleted = false,
  updated_at = now();

select setval(
  pg_get_serial_sequence('"user"', 'id'),
  greatest((select coalesce(max(id), 1) from "user"), 1)
);
