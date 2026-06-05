begin;

insert into "user" (
  id,
  name,
  student_id,
  email,
  phone,
  college,
  major,
  department,
  github,
  blog,
  personal_statement,
  qq,
  role,
  created_at,
  updated_at,
  is_deleted
) values
  (1, 'Local Admin', '001', 'admin@njupt.edu.cn', '13800001111', '计算机学院、软件学院、网络空间安全学院', '软件工程', ARRAY['software']::varchar[], 'https://github.com/NJUPT-SAST', 'https://sast.fun', '本地管理员账号', '100000', 3, now(), now(), false),
  (2, 'Demo Lecturer', '002', 'lecturer@njupt.edu.cn', '13800002222', '计算机学院、软件学院、网络空间安全学院', '网络空间安全', ARRAY['software']::varchar[], 'https://github.com/demo-lecturer', 'https://lecturer.example.com', '负责阅卷和面评的讲师账号', '200000', 2, now(), now(), false),
  (3, 'Demo Member', '003', 'member@njupt.edu.cn', '13800003333', '通信与信息工程学院', '通信工程', ARRAY['media']::varchar[], 'https://github.com/demo-member', 'https://member.example.com', '在读成员账号', '300000', 1, now(), now(), false),
  (4, 'Demo Freshman A', 'B260001', 'freshman-a@njupt.edu.cn', '13800004444', '计算机学院、软件学院、网络空间安全学院', '软件工程', ARRAY[]::varchar[], null, 'https://portfolio-a.example.com', '喜欢 Web 开发和工程化', '400000', 0, now(), now(), false),
  (5, 'Demo Freshman B', 'B260002', 'freshman-b@njupt.edu.cn', '13800005555', '人工智能学院', '人工智能', ARRAY[]::varchar[], 'https://github.com/demo-b', null, '做过一些机器学习小项目', '500000', 0, now(), now(), false),
  (6, 'Demo Freshman C', 'B260003', 'freshman-c@njupt.edu.cn', '13800006666', '传媒与艺术学院', '数字媒体艺术', ARRAY[]::varchar[], null, 'https://portfolio-c.example.com', '偏设计和视觉表达', '600000', 0, now(), now(), false),
  (7, 'Demo Freshman D', 'B260004', 'freshman-d@njupt.edu.cn', '13800007777', '物联网学院', '物联网工程', ARRAY[]::varchar[], 'https://github.com/demo-d', null, '喜欢硬件和嵌入式', '700000', 0, now(), now(), false),
  (8, 'Demo Freshman E', 'B260005', 'freshman-e@njupt.edu.cn', '13800008888', '外国语学院', '英语', ARRAY[]::varchar[], null, 'https://portfolio-e.example.com', '希望参与社团运营和内容工作', '800000', 0, now(), now(), false)
on conflict (id) do update set
  name = excluded.name,
  student_id = excluded.student_id,
  email = excluded.email,
  phone = excluded.phone,
  college = excluded.college,
  major = excluded.major,
  department = excluded.department,
  github = excluded.github,
  blog = excluded.blog,
  personal_statement = excluded.personal_statement,
  qq = excluded.qq,
  role = excluded.role,
  is_deleted = false,
  updated_at = now();

insert into flow (
  id,
  title,
  description,
  type,
  owner_id,
  created_at,
  started_at,
  ended_at,
  updated_at,
  is_deleted
) values
  (101, '2026 春季笔试招新 Demo', '覆盖报名、批卷、结果确认和邮件发送的本地演示流程。', 'recruitment', 1, now() - interval '10 days', now() - interval '7 days', now() + interval '14 days', now(), false),
  (102, '2026 免试招新 Demo', '覆盖作品链接、讲师面评和管理员审批的本地演示流程。', 'recruitment_exemption', 1, now() - interval '9 days', now() - interval '7 days', now() + interval '14 days', now(), false)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  type = excluded.type,
  owner_id = excluded.owner_id,
  started_at = excluded.started_at,
  ended_at = excluded.ended_at,
  updated_at = now(),
  is_deleted = false;

insert into flow_step (
  id,
  title,
  description,
  type,
  "order",
  fk_flow_id,
  created_at,
  updated_at,
  is_deleted
) values
  (1011, '报名', '新同学提交报名信息，报名后直接进入批卷环节。', 'registering', 1, 101, now(), now(), false),
  (1012, '批卷', '讲师为该流程内报名同学批改试卷。', 'judging', 2, 101, now(), now(), false),
  (1013, '录取确认', '按分数线筛选并确认最终通过名单。', 'finished', 3, 101, now(), now(), false),
  (1021, '报名', '提交报名信息和作品链接。', 'registering', 1, 102, now(), now(), false),
  (1022, '讲师审核', '讲师进行面评并提交同意或不同意。', 'checking', 2, 102, now(), now(), false),
  (1023, '管理员审核', '管理员审核面评结果并确认最终状态。', 'finished', 3, 102, now(), now(), false)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  type = excluded.type,
  "order" = excluded."order",
  fk_flow_id = excluded.fk_flow_id,
  updated_at = now(),
  is_deleted = false;

insert into problem (
  id,
  title,
  score,
  fk_flow_step_id
) values
  (10121, 'HTML 与语义化', 20, 1012),
  (10122, 'TypeScript 类型推导', 30, 1012),
  (10123, '数据库与事务', 30, 1012),
  (10124, '开放题：项目设计', 20, 1012)
on conflict (id) do update set
  title = excluded.title,
  score = excluded.score,
  fk_flow_step_id = excluded.fk_flow_step_id;

insert into user_flow (
  id,
  progress_status,
  fk_current_step_id,
  portfolio_link,
  fk_flow_id,
  fk_user_id
) values
  (201, 'ongoing', 1012, null, 101, 4),
  (202, 'passed', 1013, null, 101, 5),
  (203, 'failed', 1013, null, 101, 6),
  (204, 'passed', 1013, null, 101, 7),
  (205, 'failed', 1013, null, 101, 8),
  (206, 'ongoing', 1022, 'https://portfolio-a.example.com/project', 102, 4),
  (207, 'ongoing', 1022, 'https://portfolio-b.example.com/project', 102, 5),
  (208, 'ongoing', 1022, 'https://portfolio-c.example.com/project', 102, 6),
  (209, 'ongoing', 1023, 'https://portfolio-d.example.com/project', 102, 7),
  (210, 'failed', 1023, 'https://portfolio-e.example.com/project', 102, 8),
  (211, 'passed', 1023, 'https://member.example.com/interview-project', 102, 3)
on conflict (id) do update set
  progress_status = excluded.progress_status,
  fk_current_step_id = excluded.fk_current_step_id,
  portfolio_link = excluded.portfolio_link,
  fk_flow_id = excluded.fk_flow_id,
  fk_user_id = excluded.fk_user_id;

insert into user_point (
  fk_user_flow_id,
  fk_problem_id,
  points,
  fk_judger_id
) values
  (201, 10121, 14, 2),
  (201, 10122, 21, 2),
  (202, 10121, 18, 2),
  (202, 10122, 27, 2),
  (202, 10123, 25, 2),
  (202, 10124, 17, 2),
  (203, 10121, 10, 2),
  (203, 10122, 14, 2),
  (203, 10123, 12, 2),
  (203, 10124, 9, 2),
  (204, 10121, 19, 2),
  (204, 10122, 28, 2),
  (204, 10123, 26, 2),
  (204, 10124, 18, 2),
  (205, 10121, 9, 2),
  (205, 10122, 13, 2),
  (205, 10123, 10, 2),
  (205, 10124, 8, 2)
on conflict (fk_user_flow_id, fk_problem_id) do update set
  points = excluded.points,
  fk_judger_id = excluded.fk_judger_id;

delete from interview_evaluation where id in (301, 302, 303);
delete from interview_schedule where id in (701, 702, 703, 704, 705);

insert into interview_evaluation (
  id,
  fk_user_flow_id,
  fk_user_id,
  content,
  meeting_link,
  status,
  fk_reviewed_by,
  created_at,
  updated_at
) values
  (301, 209, 2, '作品结构清晰，沟通顺畅，建议通过后进入管理员复核。', 'https://memo.example.com/demo-209', 'submitted', null, now() - interval '2 days', now() - interval '2 days'),
  (302, 211, 2, '能力和表达均达到预期，已通过复核。', 'https://memo.example.com/demo-211', 'approved', 1, now() - interval '4 days', now() - interval '1 day')
on conflict (id) do update set
  fk_user_flow_id = excluded.fk_user_flow_id,
  fk_user_id = excluded.fk_user_id,
  content = excluded.content,
  meeting_link = excluded.meeting_link,
  status = excluded.status,
  fk_reviewed_by = excluded.fk_reviewed_by,
  updated_at = now();

insert into interview_schedule (
  id,
  fk_user_flow_id,
  fk_evaluation_id,
  fk_organizer_id,
  provider,
  provider_event_id,
  provider_reserve_id,
  provider_meeting_no,
  meeting_link,
  summary,
  description,
  attendee_email,
  starts_at,
  ends_at,
  timezone,
  status,
  created_at,
  updated_at
) values
  (701, 207, null, 2, 'feishu', 'demo-event-207', 'demo-reserve-207', 'demo-meeting-207', 'https://vc.feishu.cn/j/demo207', '2026 免试招新 Demo 面试 - Demo Freshman B', '本地 demo：已预约，日程尚未结束。', 'B260002@njupt.edu.cn', now() + interval '1 hour', now() + interval '90 minutes', 'Asia/Shanghai', 'created', now() - interval '10 minutes', now() - interval '10 minutes'),
  (702, 208, null, 2, 'feishu', 'demo-event-208', 'demo-reserve-208', 'demo-meeting-208', 'https://vc.feishu.cn/j/demo208', '2026 免试招新 Demo 面试 - Demo Freshman C', '本地 demo：日程已结束，等待讲师写面评。', 'B260003@njupt.edu.cn', now() - interval '2 hours', now() - interval '90 minutes', 'Asia/Shanghai', 'created', now() - interval '3 hours', now() - interval '3 hours'),
  (703, 209, 301, 2, 'feishu', 'demo-event-209', 'demo-reserve-209', 'demo-meeting-209', 'https://vc.feishu.cn/j/demo209', '2026 免试招新 Demo 面试 - Demo Freshman D', '本地 demo：日程已结束，面评待管理员审核。', 'B260004@njupt.edu.cn', now() - interval '2 days', now() - interval '47 hours', 'Asia/Shanghai', 'created', now() - interval '3 days', now() - interval '3 days'),
  (704, 210, null, 2, 'feishu', 'demo-event-210', 'demo-reserve-210', 'demo-meeting-210', 'https://vc.feishu.cn/j/demo210', '2026 免试招新 Demo 面试 - Demo Freshman E', '本地 demo：日程已结束，讲师选择不通过。', 'B260005@njupt.edu.cn', now() - interval '1 day', now() - interval '23 hours', 'Asia/Shanghai', 'created', now() - interval '2 days', now() - interval '2 days'),
  (705, 211, 302, 2, 'feishu', 'demo-event-211', 'demo-reserve-211', 'demo-meeting-211', 'https://vc.feishu.cn/j/demo211', '2026 免试招新 Demo 面试 - Demo Member', '本地 demo：日程已结束，管理员已通过。', '003@njupt.edu.cn', now() - interval '4 days', now() - interval '95 hours', 'Asia/Shanghai', 'created', now() - interval '5 days', now() - interval '5 days')
on conflict (id) do update set
  fk_user_flow_id = excluded.fk_user_flow_id,
  fk_evaluation_id = excluded.fk_evaluation_id,
  fk_organizer_id = excluded.fk_organizer_id,
  provider = excluded.provider,
  provider_event_id = excluded.provider_event_id,
  provider_reserve_id = excluded.provider_reserve_id,
  provider_meeting_no = excluded.provider_meeting_no,
  meeting_link = excluded.meeting_link,
  summary = excluded.summary,
  description = excluded.description,
  attendee_email = excluded.attendee_email,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  timezone = excluded.timezone,
  status = excluded.status,
  updated_at = now();

insert into email_template_setting (
  template_key,
  subject_template,
  member_info_form_url,
  feishu_group_url,
  calendar_url,
  feishu_register_help_url,
  contact_email,
  member_form_label,
  feishu_group_name,
  updated_at
) values
  ('recruitment.result.accepted', '{flowName} 结果通知', 'https://forms.example.com/member-info', 'https://feishu.example.com/group', 'https://calendar.example.com/sast', 'https://docs.example.com/register-help', 'sast@example.com', '成员信息登记表', 'SAST 2026 新生群', now()),
  ('recruitment.result.rejected', '{flowName} 结果通知', 'https://forms.example.com/member-info', 'https://feishu.example.com/group', 'https://calendar.example.com/sast', 'https://docs.example.com/register-help', 'sast@example.com', '成员信息登记表', 'SAST 2026 新生群', now())
on conflict (template_key) do update set
  subject_template = excluded.subject_template,
  member_info_form_url = excluded.member_info_form_url,
  feishu_group_url = excluded.feishu_group_url,
  calendar_url = excluded.calendar_url,
  feishu_register_help_url = excluded.feishu_register_help_url,
  contact_email = excluded.contact_email,
  member_form_label = excluded.member_form_label,
  feishu_group_name = excluded.feishu_group_name,
  updated_at = now();

insert into email_template_content (
  template_key,
  subject_template,
  title_template,
  body_template,
  footer_text,
  updated_at
) values (
  'interview.schedule',
  '{flowName} 面试预约通知',
  '面试预约通知',
  '{candidateName} 同学，你已预约 {flowName} 的面试，讲师为 {organizerName}。时间为 {startsAt} - {endsAt}，请通过会议链接参加：{meetingLink}',
  '南京邮电大学大学生科学技术协会',
  now()
) on conflict (template_key) do update set
  subject_template = excluded.subject_template,
  title_template = excluded.title_template,
  body_template = excluded.body_template,
  footer_text = excluded.footer_text,
  updated_at = now();

insert into email_batch (
  id,
  template_key,
  subject,
  accept,
  status,
  total_count,
  fk_flow_id,
  fk_created_by,
  created_at,
  updated_at
) values
  (401, 'recruitment.result.accepted', '2026 春季笔试招新 Demo 结果通知', true, 'completed', 1, 101, 1, now() - interval '1 day', now() - interval '1 day'),
  (402, 'recruitment.result.rejected', '2026 春季笔试招新 Demo 结果通知', false, 'failed', 2, 101, 1, now() - interval '12 hours', now() - interval '12 hours')
on conflict (id) do update set
  template_key = excluded.template_key,
  subject = excluded.subject,
  accept = excluded.accept,
  status = excluded.status,
  total_count = excluded.total_count,
  fk_flow_id = excluded.fk_flow_id,
  fk_created_by = excluded.fk_created_by,
  updated_at = now();

insert into email_delivery (
  id,
  to_address,
  subject,
  html_snapshot,
  status,
  error_message,
  provider_message_id,
  fk_email_batch_id,
  fk_user_flow_id,
  fk_user_id,
  created_at,
  sent_at,
  updated_at
) values
  (501, 'B260004@njupt.edu.cn', '2026 春季笔试招新 Demo 结果通知', '<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,sans-serif;color:#111827;"><main style="max-width:640px;margin:32px auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;"><h1 style="margin:0 0 16px;font-size:22px;">2026 春季笔试招新 Demo 结果通知</h1><p>Demo Freshman D，你已通过本轮招新。</p><p>请按通知完成后续成员信息登记。</p></main></body></html>', 'sent', null, 'demo-message-501', 401, 204, 7, now() - interval '1 day', now() - interval '1 day', now() - interval '1 day'),
  (502, 'B260003@njupt.edu.cn', '2026 春季笔试招新 Demo 结果通知', '<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,sans-serif;color:#111827;"><main style="max-width:640px;margin:32px auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;"><h1 style="margin:0 0 16px;font-size:22px;">2026 春季笔试招新 Demo 结果通知</h1><p>Demo Freshman C，很遗憾本次未通过。</p><p>感谢你的参与，欢迎继续关注后续活动。</p></main></body></html>', 'failed', 'SMTP demo failure', null, 402, 203, 6, now() - interval '12 hours', null, now() - interval '12 hours'),
  (503, 'B260005@njupt.edu.cn', '2026 春季笔试招新 Demo 结果通知', '<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,sans-serif;color:#111827;"><main style="max-width:640px;margin:32px auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;"><h1 style="margin:0 0 16px;font-size:22px;">2026 春季笔试招新 Demo 结果通知</h1><p>Demo Freshman E，很遗憾本次未通过。</p><p>感谢你的参与，欢迎继续关注后续活动。</p></main></body></html>', 'sent', null, 'demo-message-503', 402, 205, 8, now() - interval '12 hours', now() - interval '12 hours', now() - interval '12 hours')
on conflict (id) do update set
  to_address = excluded.to_address,
  subject = excluded.subject,
  html_snapshot = excluded.html_snapshot,
  status = excluded.status,
  error_message = excluded.error_message,
  provider_message_id = excluded.provider_message_id,
  fk_email_batch_id = excluded.fk_email_batch_id,
  fk_user_flow_id = excluded.fk_user_flow_id,
  fk_user_id = excluded.fk_user_id,
  sent_at = excluded.sent_at,
  updated_at = now();

insert into operation_audit (
  id,
  actor_id,
  action,
  resource_type,
  resource_id,
  metadata,
  created_at
) values
  (601, 1, 'demo.seed', 'flow', 101, '{"note":"local demo written recruitment"}'::jsonb, now()),
  (602, 1, 'demo.seed', 'flow', 102, '{"note":"local demo evaluation recruitment"}'::jsonb, now())
on conflict (id) do update set
  actor_id = excluded.actor_id,
  action = excluded.action,
  resource_type = excluded.resource_type,
  resource_id = excluded.resource_id,
  metadata = excluded.metadata,
  created_at = excluded.created_at;

select setval(pg_get_serial_sequence('"user"', 'id'), greatest((select coalesce(max(id), 1) from "user"), 1));
select setval(pg_get_serial_sequence('flow', 'id'), greatest((select coalesce(max(id), 1) from flow), 1));
select setval(pg_get_serial_sequence('flow_step', 'id'), greatest((select coalesce(max(id), 1) from flow_step), 1));
select setval(pg_get_serial_sequence('problem', 'id'), greatest((select coalesce(max(id), 1) from problem), 1));
select setval(pg_get_serial_sequence('user_flow', 'id'), greatest((select coalesce(max(id), 1) from user_flow), 1));
select setval(pg_get_serial_sequence('user_point', 'id'), greatest((select coalesce(max(id), 1) from user_point), 1));
select setval(pg_get_serial_sequence('interview_evaluation', 'id'), greatest((select coalesce(max(id), 1) from interview_evaluation), 1));
select setval(pg_get_serial_sequence('interview_schedule', 'id'), greatest((select coalesce(max(id), 1) from interview_schedule), 1));
select setval(pg_get_serial_sequence('email_batch', 'id'), greatest((select coalesce(max(id), 1) from email_batch), 1));
select setval(pg_get_serial_sequence('email_delivery', 'id'), greatest((select coalesce(max(id), 1) from email_delivery), 1));
select setval(pg_get_serial_sequence('email_template_setting', 'id'), greatest((select coalesce(max(id), 1) from email_template_setting), 1));
select setval(pg_get_serial_sequence('email_template_content', 'id'), greatest((select coalesce(max(id), 1) from email_template_content), 1));
select setval(pg_get_serial_sequence('operation_audit', 'id'), greatest((select coalesce(max(id), 1) from operation_audit), 1));

commit;
