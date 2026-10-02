begin;

/* 清理历史脏数据：早期本地演示 / 临时导入留下的 test 与 E2E 夹具流程。
   先删邮件批次与发布记录（这两张表对 flow 是 restrict），
   其余报名 / 面评 / 日程 / 积分随 flow 级联删除。 */
delete from email_delivery
where fk_flow_id in (select id from flow where title = 'test' or title ilike 'E2E %');
delete from email_batch
where fk_flow_id in (select id from flow where title = 'test' or title ilike 'E2E %');
delete from flow_result_publication
where fk_flow_id in (select id from flow where title = 'test' or title ilike 'E2E %');
delete from flow where title = 'test' or title ilike 'E2E %';

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
  is_deleted,
  group_options,
  department
) values
  (101, '2026 校科协软件研发部 春季笔试招新', '2026 年校科协软件研发部春季笔试招新（本地演示数据：报名、批卷、结果确认与结果邮件）。', 'recruitment', 1, now() - interval '10 days', now() - interval '7 days', now() + interval '14 days', now(), false, null, 'software'),
  (102, '2026 校科协软件研发部 免试招新', '2026 年校科协软件研发部免试招新（本地演示数据：作品链接、讲师面评、管理员终审与结果邮件）。', 'recruitment_exemption', 1, now() - interval '9 days', now() - interval '7 days', now() + interval '14 days', now(), false, '["前端组","后端组","算法组"]'::jsonb, 'software'),
  (103, '2026 校科协软件研发部 秋季笔试招新', '2026 年校科协软件研发部秋季笔试招新（本地演示数据：进行中的报名、待批卷、待确认与部分最终结果）。', 'recruitment', 1, now() - interval '2 days', now() - interval '1 day', now() + interval '21 days', now(), false, null, 'software')
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  type = excluded.type,
  owner_id = excluded.owner_id,
  started_at = excluded.started_at,
  ended_at = excluded.ended_at,
  updated_at = now(),
  is_deleted = false,
  group_options = excluded.group_options,
  department = excluded.department;

/* 清理办公类部门面试演示数据：每个办公部门一条流程（office_interview，department 非空），
   报名/面评/改期申请/邮件/发布记录全部重建，保证种子可重复执行 */
delete from email_delivery where fk_flow_id in (select id from flow where type = 'office_interview');
delete from email_batch where fk_flow_id in (select id from flow where type = 'office_interview');
delete from flow_result_publication where fk_flow_id in (select id from flow where type = 'office_interview');
delete from interview_slot_change_request
where fk_user_flow_id in (
  select id from user_flow where fk_flow_id in (select id from flow where type = 'office_interview')
);
delete from interview_evaluation
where fk_user_flow_id in (
  select id from user_flow where fk_flow_id in (select id from flow where type = 'office_interview')
);
delete from user_flow where fk_flow_id in (select id from flow where type = 'office_interview');
delete from flow_step where fk_flow_id in (select id from flow where type = 'office_interview');
delete from flow where type = 'office_interview';

/* 办公类部门面试招新：办公室 / 科宣部 / 外联部 / 赛事部各一条独立流程。
   候选人在两个部门流程分别报名并选择志愿类型（choice：1=第一志愿、2=第二志愿），
   流程内依次完成一面与二面；各部门流程的权限、邮件模板与结果发布互相独立。 */
insert into flow (
  id,
  title,
  description,
  type,
  owner_id,
  department,
  group_options,
  group_departments,
  slot_options,
  created_at,
  started_at,
  ended_at,
  updated_at,
  is_deleted
) values
  (121, '2026 校科协办公室 面试', '2026 年校科协办公室面试（本地演示数据：志愿类型 + 面试时段报名、一面、二面与名单确认）。', 'office_interview', 1, 'office', null, null, '[{"label":"13:00-14:00"},{"label":"14:00-15:00"},{"label":"15:00-16:00"},{"label":"16:00-17:00"},{"label":"17:00-18:00"},{"label":"时间冲突，约面时间QQ群中另行通知","isConflict":true}]'::jsonb, now(), now() - interval '3 days', now() + interval '14 days', now(), false),
  (122, '2026 校科协科宣部 面试', '2026 年校科协科宣部面试（本地演示数据：志愿类型 + 面试时段报名、一面、二面与名单确认）。', 'office_interview', 1, 'publicity', null, null, '[{"label":"13:00-14:00"},{"label":"14:00-15:00"},{"label":"15:00-16:00"},{"label":"16:00-17:00"},{"label":"17:00-18:00"},{"label":"时间冲突，约面时间QQ群中另行通知","isConflict":true}]'::jsonb, now(), now() - interval '3 days', now() + interval '14 days', now(), false),
  (123, '2026 校科协外联部 面试', '2026 年校科协外联部面试（本地演示数据：志愿类型 + 面试时段报名、一面、二面与名单确认）。', 'office_interview', 1, 'liaison', null, null, '[{"label":"13:00-14:00"},{"label":"14:00-15:00"},{"label":"15:00-16:00"},{"label":"16:00-17:00"},{"label":"17:00-18:00"},{"label":"时间冲突，约面时间QQ群中另行通知","isConflict":true}]'::jsonb, now(), now() - interval '3 days', now() + interval '14 days', now(), false),
  (124, '2026 校科协赛事部 面试', '2026 年校科协赛事部面试（本地演示数据：志愿类型 + 面试时段报名、一面、二面与名单确认）。', 'office_interview', 1, 'competition', null, null, '[{"label":"13:00-14:00"},{"label":"14:00-15:00"},{"label":"15:00-16:00"},{"label":"16:00-17:00"},{"label":"17:00-18:00"},{"label":"时间冲突，约面时间QQ群中另行通知","isConflict":true}]'::jsonb, now(), now() - interval '3 days', now() + interval '14 days', now(), false)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  type = excluded.type,
  owner_id = excluded.owner_id,
  department = excluded.department,
  group_options = excluded.group_options,
  group_departments = excluded.group_departments,
  slot_options = excluded.slot_options,
  started_at = excluded.started_at,
  ended_at = excluded.ended_at,
  updated_at = now(),
  is_deleted = excluded.is_deleted;

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
  (1023, '管理员审核', '管理员审核面评结果并确认最终状态。', 'finished', 3, 102, now(), now(), false),
  (1031, '报名', '新同学提交报名信息，报名后进入批卷环节。', 'registering', 1, 103, now(), now(), false),
  (1032, '批卷', '讲师为当前流程内报名同学批改试卷。', 'judging', 2, 103, now(), now(), false),
  (1033, '录取确认', '按分数线筛选并确认最终通过名单。', 'finished', 3, 103, now(), now(), false),
  -- 办公类部门面试招新（每个部门一条流程）：报名 → 一面面试 → 二面面试 → 结果确认
  (1211, '报名', '提交报名信息，选择志愿类型（第一志愿/第二志愿）与面试时段。', 'registering', 1, 121, now(), now(), false),
  (1212, '一面面试', '部长进行一面面试并提交面评与分数，通过后进入二面。', 'checking', 2, 121, now(), now(), false),
  (1213, '二面面试', '无领导小组面试，由多位部长分别打分。', 'checking', 3, 121, now(), now(), false),
  (1214, '结果确认', '部长/管理员确认最终结果并发布录取通知。', 'finished', 4, 121, now(), now(), false),
  (1221, '报名', '提交报名信息，选择志愿类型（第一志愿/第二志愿）与面试时段。', 'registering', 1, 122, now(), now(), false),
  (1222, '一面面试', '部长进行一面面试并提交面评与分数，通过后进入二面。', 'checking', 2, 122, now(), now(), false),
  (1223, '二面面试', '无领导小组面试，由多位部长分别打分。', 'checking', 3, 122, now(), now(), false),
  (1224, '结果确认', '部长/管理员确认最终结果并发布录取通知。', 'finished', 4, 122, now(), now(), false),
  (1231, '报名', '提交报名信息，选择志愿类型（第一志愿/第二志愿）与面试时段。', 'registering', 1, 123, now(), now(), false),
  (1232, '一面面试', '部长进行一面面试并提交面评与分数，通过后进入二面。', 'checking', 2, 123, now(), now(), false),
  (1233, '二面面试', '无领导小组面试，由多位部长分别打分。', 'checking', 3, 123, now(), now(), false),
  (1234, '结果确认', '部长/管理员确认最终结果并发布录取通知。', 'finished', 4, 123, now(), now(), false),
  (1241, '报名', '提交报名信息，选择志愿类型（第一志愿/第二志愿）与面试时段。', 'registering', 1, 124, now(), now(), false),
  (1242, '一面面试', '部长进行一面面试并提交面评与分数，通过后进入二面。', 'checking', 2, 124, now(), now(), false),
  (1243, '二面面试', '无领导小组面试，由多位部长分别打分。', 'checking', 3, 124, now(), now(), false),
  (1244, '结果确认', '部长/管理员确认最终结果并发布录取通知。', 'finished', 4, 124, now(), now(), false)
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
  (10124, '开放题：项目设计', 20, 1012),
  (10321, '前端工程实践', 25, 1032),
  (10322, 'TypeScript 与类型安全', 25, 1032),
  (10323, '数据库设计与事务', 25, 1032),
  (10324, '开放题：系统方案', 25, 1032)
on conflict (id) do update set
  title = excluded.title,
  score = excluded.score,
  fk_flow_step_id = excluded.fk_flow_step_id;

insert into user_flow (
  id,
  progress_status,
  fk_current_step_id,
  portfolio_link,
  apply_group,
  fk_flow_id,
  fk_user_id,
  department
) values
  (201, 'failed', 1013, null, null, 101, 4, 'software'),
  (202, 'passed', 1013, null, null, 101, 5, 'software'),
  (203, 'failed', 1013, null, null, 101, 6, 'software'),
  (204, 'passed', 1013, null, null, 101, 7, 'software'),
  (205, 'failed', 1013, null, null, 101, 8, 'software'),
  (206, 'ongoing', 1022, 'https://portfolio-a.example.com/project', '前端组', 102, 4, 'software'),
  (207, 'ongoing', 1022, 'https://portfolio-b.example.com/project', '后端组', 102, 5, 'software'),
  (208, 'ongoing', 1022, 'https://portfolio-c.example.com/project', '算法组', 102, 6, 'software'),
  (209, 'ongoing', 1023, 'https://portfolio-d.example.com/project', '前端组', 102, 7, 'software'),
  (210, 'failed', 1023, 'https://portfolio-e.example.com/project', '后端组', 102, 8, 'software'),
  (211, 'passed', 1023, 'https://member.example.com/interview-project', '前端组', 102, 3, 'software'),
  (221, 'not_started', 1031, null, null, 103, 4, 'software'),
  (222, 'ongoing', 1031, null, null, 103, 5, 'software'),
  (223, 'ongoing', 1032, null, null, 103, 6, 'software'),
  (224, 'ongoing', 1032, null, null, 103, 7, 'software'),
  (225, 'passed', 1033, null, null, 103, 8, 'software'),
  (226, 'failed', 1033, null, null, 103, 9, 'software'),
  (227, 'withdrawn', 1032, null, null, 103, 10, 'software')
on conflict (id) do update set
  progress_status = excluded.progress_status,
  fk_current_step_id = excluded.fk_current_step_id,
  portfolio_link = excluded.portfolio_link,
  apply_group = excluded.apply_group,
  fk_flow_id = excluded.fk_flow_id,
  fk_user_id = excluded.fk_user_id,
  department = excluded.department;

/* 办公类部门面试招新报名（每个部门一条流程）：choice 为志愿类型（1=第一志愿、2=第二志愿），
   round 为当前阶段（1=一面，2=二面）
   - 401/402/408 一面进行中（402 有待审批的改时段申请；408 是 uid 4 在科宣部的第二志愿）
   - 403/404 已通过一面、二面进行中（403 带多位部长的二面面评）
   - 405 两轮均通过（带一面面评）；410 是 uid 8 在赛事部的第二志愿，同样两轮通过（最终去向演示）
   - 406 一面未通过，407 二面未通过，409 已退回 */
insert into user_flow (
  id,
  progress_status,
  fk_current_step_id,
  apply_group,
  round,
  interview_slot,
  choice,
  fk_flow_id,
  fk_user_id,
  department
) values
  (401, 'ongoing', 1212, null, 1, '13:00-14:00', 1, 121, 4, 'office'),
  (402, 'ongoing', 1212, null, 1, '14:00-15:00', 1, 121, 5, 'office'),
  (403, 'ongoing', 1213, null, 2, '15:00-16:00', 1, 121, 6, 'office'),
  (404, 'ongoing', 1223, null, 2, '16:00-17:00', 1, 122, 7, 'publicity'),
  (405, 'passed', 1214, null, 2, '13:00-14:00', 1, 121, 8, 'office'),
  (406, 'failed', 1234, null, 1, '14:00-15:00', 1, 123, 9, 'liaison'),
  (407, 'failed', 1244, null, 2, '15:00-16:00', 1, 124, 10, 'competition'),
  (408, 'ongoing', 1222, null, 1, '17:00-18:00', 2, 122, 4, 'publicity'),
  (409, 'withdrawn', 1242, null, 1, '16:00-17:00', 2, 124, 5, 'competition'),
  (410, 'passed', 1244, null, 2, '16:00-17:00', 2, 124, 8, 'competition')
on conflict (id) do update set
  progress_status = excluded.progress_status,
  fk_current_step_id = excluded.fk_current_step_id,
  apply_group = excluded.apply_group,
  round = excluded.round,
  interview_slot = excluded.interview_slot,
  choice = excluded.choice,
  fk_flow_id = excluded.fk_flow_id,
  fk_user_id = excluded.fk_user_id,
  department = excluded.department,
  final_department = null;

insert into flow_result_publication (
  fk_flow_id,
  status,
  version,
  result_snapshot,
  template_snapshot,
  confirmed_by,
  confirmed_at,
  published_at,
  created_at,
  updated_at
) values (
  101,
  'published',
  1,
  jsonb_build_object(
    'flowId', 101,
    'flowTitle', '2026 校科协软件研发部 春季笔试招新',
    'rows', jsonb_build_array(
      jsonb_build_object('userFlowId', 201, 'userId', 4, 'status', 'failed'),
      jsonb_build_object('userFlowId', 202, 'userId', 5, 'status', 'passed'),
      jsonb_build_object('userFlowId', 203, 'userId', 6, 'status', 'failed'),
      jsonb_build_object('userFlowId', 204, 'userId', 7, 'status', 'passed'),
      jsonb_build_object('userFlowId', 205, 'userId', 8, 'status', 'failed')
    ),
    'counts', jsonb_build_object('total', 5, 'accepted', 2, 'rejected', 3, 'withdrawn', 0, 'unfinished', 0)
  ),
  '{}'::jsonb,
  1,
  now() - interval '1 day',
  now() - interval '1 day',
  now() - interval '1 day',
  now()
) on conflict (fk_flow_id) do update set
  status = excluded.status,
  version = excluded.version,
  result_snapshot = excluded.result_snapshot,
  template_snapshot = excluded.template_snapshot,
  confirmed_by = excluded.confirmed_by,
  confirmed_at = excluded.confirmed_at,
  published_at = excluded.published_at,
  updated_at = now();

insert into user_point (
  fk_user_flow_id,
  fk_problem_id,
  points,
  note,
  fk_judger_id
) values
  (201, 10121, 14, '语义化标签使用基本正确，可补充无障碍属性。', 2),
  (201, 10122, 21, null, 2),
  (202, 10121, 18, '结构清晰，细节处理到位。', 2),
  (202, 10122, 27, '类型推导准确。', 2),
  (202, 10123, 25, null, 2),
  (202, 10124, 17, '方案完整，边界场景还可以再展开。', 2),
  (203, 10121, 10, '语义标签混用，需要改进。', 2),
  (203, 10122, 14, null, 2),
  (203, 10123, 12, null, 2),
  (203, 10124, 9, '只描述了功能，没有说明取舍。', 2),
  (204, 10121, 19, null, 2),
  (204, 10122, 28, '类型设计优秀。', 2),
  (204, 10123, 26, null, 2),
  (204, 10124, 18, '项目设计有亮点，表达清楚。', 2),
  (205, 10121, 9, null, 2),
  (205, 10122, 13, '需要补充类型安全说明。', 2),
  (205, 10123, 10, null, 2),
  (205, 10124, 8, '方案完成度较低。', 2),
  (223, 10321, 20, '组件拆分合理，但还可以补充异常态处理。', 2),
  (223, 10322, 18, null, 2),
  (224, 10321, 23, '工程实践扎实。', 2),
  (224, 10322, 22, '类型边界说明清楚。', 2),
  (224, 10323, 20, null, 2),
  (224, 10324, 21, '方案完整，取舍合理。', 2),
  (225, 10321, 24, null, 2),
  (225, 10322, 24, '类型安全意识较好。', 2),
  (225, 10323, 23, null, 2),
  (225, 10324, 22, '可以进入后续环节。', 2),
  (226, 10321, 12, '基础实现存在明显缺陷。', 2),
  (226, 10322, 14, null, 2),
  (226, 10323, 11, '事务边界处理不完整。', 2),
  (226, 10324, 10, '方案缺少关键细节。', 2)
on conflict (fk_user_flow_id, fk_problem_id) do update set
  points = excluded.points,
  note = excluded.note,
  fk_judger_id = excluded.fk_judger_id;

delete from interview_evaluation where id in (301, 302, 303);
delete from interview_schedule where id in (701, 702, 703, 704, 705);

insert into interview_evaluation (
  id,
  fk_user_flow_id,
  fk_user_id,
  content,
  meeting_link,
  recommendation,
  status,
  fk_reviewed_by,
  created_at,
  updated_at
) values
  (301, 209, 202, '作品结构清晰，沟通顺畅，建议通过后进入管理员复核。', 'https://memo.example.com/demo-209', 'passed', 'submitted', null, now() - interval '2 days', now() - interval '2 days'),
  (302, 211, 202, '能力和表达均达到预期，已通过复核。', 'https://memo.example.com/demo-211', 'passed', 'approved', 1, now() - interval '4 days', now() - interval '1 day'),
  (303, 210, 202, '基础能力与岗位要求不匹配，本轮不建议通过。', 'https://memo.example.com/demo-210', 'failed', 'rejected', 1, now() - interval '3 days', now() - interval '2 days'),
  (304, 208, 202, '请补充项目中的个人贡献和技术取舍。', 'https://memo.example.com/demo-208', 'passed', 'returned', 1, now() - interval '1 day', now() - interval '12 hours')
on conflict (id) do update set
  fk_user_flow_id = excluded.fk_user_flow_id,
  fk_user_id = excluded.fk_user_id,
  content = excluded.content,
  meeting_link = excluded.meeting_link,
  recommendation = excluded.recommendation,
  status = excluded.status,
  fk_reviewed_by = excluded.fk_reviewed_by,
  updated_at = now();

/* 办公类部门面试招新面评（各部门流程，flow 121）：round 记录面评所属轮次
   - 9001 为两轮均通过候选人（405）的一面面评
   - 9002–9004 为二面进行中候选人（403）的二面面评，三位部长分别打分，用于平均分与排序演示 */
insert into interview_evaluation (
  id,
  fk_user_flow_id,
  fk_user_id,
  score,
  round,
  content,
  meeting_link,
  recommendation,
  status,
  fk_reviewed_by,
  created_at,
  updated_at
) values
  (9001, 405, 213, 88, 1, '候选人表达清晰，对办公室日常事务的理解比较到位。对社团活动的组织流程也有自己的思考，建议通过一面。', 'https://memo.example.com/demo-office-405', 'passed', 'submitted', null, now() - interval '1 day', now() - interval '1 day'),
  (9002, 403, 213, 85, 2, '无领导小组讨论中主动承担记录与汇总，配合度较好。发言时能结合具体例子，观点比较扎实。', 'https://memo.example.com/demo-office-403-a', 'passed', 'submitted', null, now() - interval '6 hours', now() - interval '6 hours'),
  (9003, 403, 217, 90, 2, '对议题的理解有深度，能照顾到组内其他同学的意见。表达和沟通能力在小组中比较突出。', 'https://memo.example.com/demo-office-403-b', 'passed', 'submitted', null, now() - interval '5 hours', now() - interval '5 hours'),
  (9004, 403, 221, 78, 2, '发言相对被动，抛出观点后缺少进一步论证。不过材料准备充分，整体仍有提升空间。', 'https://memo.example.com/demo-office-403-c', 'passed', 'submitted', null, now() - interval '4 hours', now() - interval '4 hours')
on conflict (id) do update set
  fk_user_flow_id = excluded.fk_user_flow_id,
  fk_user_id = excluded.fk_user_id,
  score = excluded.score,
  round = excluded.round,
  content = excluded.content,
  meeting_link = excluded.meeting_link,
  recommendation = excluded.recommendation,
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
  location,
  meeting_room_id,
  attendee_email,
  starts_at,
  ends_at,
  timezone,
  status,
  created_at,
  updated_at
) values
  (701, 207, null, 202, 'feishu', 'demo-event-207', 'demo-reserve-207', 'demo-meeting-207', 'https://vc.feishu.cn/j/demo207', '2026 校科协软件研发部 免试招新 面试 - 李瑶', '本地 demo：已预约，日程尚未结束。', '大学生活动中心-101 中区', 'omm_17a653591966274e91219f66043e1218', 'B00040005@njupt.edu.cn', now() + interval '1 hour', now() + interval '90 minutes', 'Asia/Shanghai', 'created', now() - interval '10 minutes', now() - interval '10 minutes'),
  -- 同样由软件研发部讲师（202 周礼）发起
  (702, 208, null, 202, 'feishu', 'demo-event-208', 'demo-reserve-208', 'demo-meeting-208', 'https://vc.feishu.cn/j/demo208', '2026 校科协软件研发部 免试招新 面试 - 张昊然', '本地 demo：日程已结束，等待讲师写面评。', '大学生活动中心-汇客厅(112 - 113)', 'omm_f2b7a9f9ba5afa0b96906cf2cb4f1a06', 'B00040006@njupt.edu.cn', now() - interval '2 hours', now() - interval '90 minutes', 'Asia/Shanghai', 'created', now() - interval '3 hours', now() - interval '3 hours'),
  (703, 209, 301, 202, 'feishu', 'demo-event-209', 'demo-reserve-209', 'demo-meeting-209', 'https://vc.feishu.cn/j/demo209', '2026 校科协软件研发部 免试招新 面试 - 欧阳文博', '本地 demo：日程已结束，面评待管理员审核。', '教三 204', null, 'B00040007@njupt.edu.cn', now() - interval '2 days', now() - interval '47 hours', 'Asia/Shanghai', 'created', now() - interval '3 days', now() - interval '3 days'),
  (704, 210, null, 202, 'feishu', 'demo-event-210', 'demo-reserve-210', 'demo-meeting-210', 'https://vc.feishu.cn/j/demo210', '2026 校科协软件研发部 免试招新 面试 - 吴承宇', '本地 demo：日程已结束，讲师选择不通过。', '大学生活动中心-101 中区', 'omm_17a653591966274e91219f66043e1218', 'B00040008@njupt.edu.cn', now() - interval '1 day', now() - interval '23 hours', 'Asia/Shanghai', 'created', now() - interval '2 days', now() - interval '2 days'),
  (705, 211, 302, 202, 'feishu', 'demo-event-211', 'demo-reserve-211', 'demo-meeting-211', 'https://vc.feishu.cn/j/demo211', '2026 校科协软件研发部 免试招新 面试 - 沈亦舟', '本地 demo：日程已结束，管理员已通过。', '教三 204', null, 'B00040003@njupt.edu.cn', now() - interval '4 days', now() - interval '95 hours', 'Asia/Shanghai', 'created', now() - interval '5 days', now() - interval '5 days')
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
  location = excluded.location,
  meeting_room_id = excluded.meeting_room_id,
  attendee_email = excluded.attendee_email,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  timezone = excluded.timezone,
  status = excluded.status,
  updated_at = now();

/* 待审批的改期申请：免试一面候选人（user_flow 207 / 日程 701）申请改到第二天同一时段
   （办公类时段调整已改为部长直接修改，不再产生待审批申请） */
insert into interview_slot_change_request (
  id,
  fk_user_flow_id,
  fk_interview_schedule_id,
  requested_starts_at,
  requested_ends_at,
  reason,
  status,
  fk_requested_by,
  created_at,
  updated_at
) values
  (9001, 207, 701, now() + interval '26 hours', now() + interval '27 hours 30 minutes', '明天上午有课，希望能改到同一时段的第二天，谢谢！', 'pending', 5, now() - interval '2 hours', now() - interval '2 hours')
on conflict (id) do update set
  fk_user_flow_id = excluded.fk_user_flow_id,
  fk_interview_schedule_id = excluded.fk_interview_schedule_id,
  requested_starts_at = excluded.requested_starts_at,
  requested_ends_at = excluded.requested_ends_at,
  reason = excluded.reason,
  status = excluded.status,
  fk_requested_by = excluded.fk_requested_by,
  updated_at = now();

/* ---------------------------------------------------------------------------
   全部门 × 全类型流程演示数据（覆盖流程管理 / 笔试管理 / 面评审批 / 面试管理的每种口径）：
   - 软件研发部：笔试（101/103）、免试（102）、WOC（131）、SOC（132）
   - 多媒体部：笔试（133）、免试（134）、WOD（135）、SOD（136）
   - 电子部：笔试（137）、免试（138）、WOC（139）、SOC（140）
   - 办公类：办公室 / 科宣部 / 外联部 / 赛事部面试（121–124）
   每条流程都带步骤；报名覆盖 未开始 / 进行中 / 通过 / 未通过 / 已退回；
   面试类流程带面评（待审批 / 已通过 / 已驳回 / 退回重写），笔试流程带题目与部分批卷分数。
   --------------------------------------------------------------------------- */
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
  is_deleted,
  group_options,
  department
) values
  (131, '2026 校科协软件研发部 WOC', '2026 年校科协软件研发部 WOC 阶段考核（本地演示数据：报名、讲师面评、管理员终审）。', 'woc', 201, now() - interval '6 days', now() - interval '5 days', now() + interval '14 days', now(), false, '["前端组","后端组","算法组"]'::jsonb, 'software'),
  (132, '2026 校科协软件研发部 SOC', '2026 年校科协软件研发部 SOC 留任考核（本地演示数据：报名、讲师面评、管理员终审）。', 'soc', 201, now() - interval '5 days', now() - interval '4 days', now() + interval '14 days', now(), false, '["前端组","后端组","算法组"]'::jsonb, 'software'),
  (133, '2026 校科协多媒体部 笔试招新', '2026 年校科协多媒体部笔试招新（本地演示数据：报名、批卷、结果发布与结果邮件）。', 'recruitment', 205, now() - interval '8 days', now() - interval '7 days', now() + interval '14 days', now(), false, null, 'media'),
  (134, '2026 校科协多媒体部 免试招新', '2026 年校科协多媒体部免试招新（本地演示数据：作品链接、讲师面评、管理员终审）。', 'recruitment_exemption', 205, now() - interval '7 days', now() - interval '6 days', now() + interval '14 days', now(), false, '["视频组","设计组"]'::jsonb, 'media'),
  (135, '2026 校科协多媒体部 WOD', '2026 年校科协多媒体部 WOD 阶段考核（本地演示数据：报名、讲师面评、管理员终审）。', 'woc', 205, now() - interval '6 days', now() - interval '5 days', now() + interval '14 days', now(), false, '["视频组","设计组"]'::jsonb, 'media'),
  (136, '2026 校科协多媒体部 SOD', '2026 年校科协多媒体部 SOD 留任考核（本地演示数据：报名、讲师面评、管理员终审）。', 'soc', 205, now() - interval '5 days', now() - interval '4 days', now() + interval '14 days', now(), false, '["视频组","设计组"]'::jsonb, 'media'),
  (137, '2026 校科协电子部 笔试招新', '2026 年校科协电子部笔试招新（本地演示数据：报名、批卷、结果确认）。', 'recruitment', 209, now() - interval '8 days', now() - interval '7 days', now() + interval '14 days', now(), false, null, 'electronics'),
  (138, '2026 校科协电子部 免试招新', '2026 年校科协电子部免试招新（本地演示数据：作品链接、讲师面评、管理员终审）。', 'recruitment_exemption', 209, now() - interval '7 days', now() - interval '6 days', now() + interval '14 days', now(), false, '["硬件组","嵌入式组"]'::jsonb, 'electronics'),
  (139, '2026 校科协电子部 WOC', '2026 年校科协电子部 WOC 阶段考核（本地演示数据：报名、讲师面评、管理员终审）。', 'woc', 209, now() - interval '6 days', now() - interval '5 days', now() + interval '14 days', now(), false, '["硬件组","嵌入式组"]'::jsonb, 'electronics'),
  (140, '2026 校科协电子部 SOC', '2026 年校科协电子部 SOC 留任考核（本地演示数据：报名、讲师面评、管理员终审）。', 'soc', 209, now() - interval '5 days', now() - interval '4 days', now() + interval '14 days', now(), false, '["硬件组","嵌入式组"]'::jsonb, 'electronics')
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  type = excluded.type,
  owner_id = excluded.owner_id,
  started_at = excluded.started_at,
  ended_at = excluded.ended_at,
  updated_at = now(),
  is_deleted = false,
  group_options = excluded.group_options,
  department = excluded.department;

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
  (1311, '报名', '提交报名信息与作品链接。', 'registering', 1, 131, now(), now(), false),
  (1312, '讲师审核', '讲师进行面评并提交同意或不同意。', 'checking', 2, 131, now(), now(), false),
  (1313, '管理员审核', '管理员审核面评结果并确认最终状态。', 'finished', 3, 131, now(), now(), false),
  (1321, '报名', '提交报名信息与作品链接。', 'registering', 1, 132, now(), now(), false),
  (1322, '讲师审核', '讲师进行面评并提交同意或不同意。', 'checking', 2, 132, now(), now(), false),
  (1323, '管理员审核', '管理员审核面评结果并确认最终状态。', 'finished', 3, 132, now(), now(), false),
  (1331, '报名', '新同学提交报名信息，报名后进入批卷环节。', 'registering', 1, 133, now(), now(), false),
  (1332, '批卷', '讲师为当前流程内报名同学批改试卷。', 'judging', 2, 133, now(), now(), false),
  (1333, '录取确认', '按分数线筛选并确认最终通过名单。', 'finished', 3, 133, now(), now(), false),
  (1341, '报名', '提交报名信息与作品链接。', 'registering', 1, 134, now(), now(), false),
  (1342, '讲师审核', '讲师进行面评并提交同意或不同意。', 'checking', 2, 134, now(), now(), false),
  (1343, '管理员审核', '管理员审核面评结果并确认最终状态。', 'finished', 3, 134, now(), now(), false),
  (1351, '报名', '提交报名信息与作品链接。', 'registering', 1, 135, now(), now(), false),
  (1352, '讲师审核', '讲师进行面评并提交同意或不同意。', 'checking', 2, 135, now(), now(), false),
  (1353, '管理员审核', '管理员审核面评结果并确认最终状态。', 'finished', 3, 135, now(), now(), false),
  (1361, '报名', '提交报名信息与作品链接。', 'registering', 1, 136, now(), now(), false),
  (1362, '讲师审核', '讲师进行面评并提交同意或不同意。', 'checking', 2, 136, now(), now(), false),
  (1363, '管理员审核', '管理员审核面评结果并确认最终状态。', 'finished', 3, 136, now(), now(), false),
  (1371, '报名', '新同学提交报名信息，报名后进入批卷环节。', 'registering', 1, 137, now(), now(), false),
  (1372, '批卷', '讲师为当前流程内报名同学批改试卷。', 'judging', 2, 137, now(), now(), false),
  (1373, '录取确认', '按分数线筛选并确认最终通过名单。', 'finished', 3, 137, now(), now(), false),
  (1381, '报名', '提交报名信息与作品链接。', 'registering', 1, 138, now(), now(), false),
  (1382, '讲师审核', '讲师进行面评并提交同意或不同意。', 'checking', 2, 138, now(), now(), false),
  (1383, '管理员审核', '管理员审核面评结果并确认最终状态。', 'finished', 3, 138, now(), now(), false),
  (1391, '报名', '提交报名信息与作品链接。', 'registering', 1, 139, now(), now(), false),
  (1392, '讲师审核', '讲师进行面评并提交同意或不同意。', 'checking', 2, 139, now(), now(), false),
  (1393, '管理员审核', '管理员审核面评结果并确认最终状态。', 'finished', 3, 139, now(), now(), false),
  (1401, '报名', '提交报名信息与作品链接。', 'registering', 1, 140, now(), now(), false),
  (1402, '讲师审核', '讲师进行面评并提交同意或不同意。', 'checking', 2, 140, now(), now(), false),
  (1403, '管理员审核', '管理员审核面评结果并确认最终状态。', 'finished', 3, 140, now(), now(), false)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  type = excluded.type,
  "order" = excluded."order",
  fk_flow_id = excluded.fk_flow_id,
  updated_at = now(),
  is_deleted = false;

insert into user_flow (
  id,
  progress_status,
  fk_current_step_id,
  portfolio_link,
  apply_group,
  fk_flow_id,
  fk_user_id,
  department
) values
  (501, 'ongoing', 1312, 'https://portfolio.example.com/woc-501', '前端组', 131, 3, 'software'),
  (502, 'passed', 1313, 'https://portfolio.example.com/woc-502', '后端组', 131, 4, 'software'),
  (503, 'failed', 1313, 'https://portfolio.example.com/woc-503', '算法组', 131, 5, 'software'),
  (504, 'ongoing', 1322, 'https://portfolio.example.com/soc-504', '前端组', 132, 6, 'software'),
  (505, 'passed', 1323, 'https://portfolio.example.com/soc-505', '后端组', 132, 7, 'software'),
  (506, 'not_started', 1331, null, null, 133, 3, 'media'),
  (507, 'ongoing', 1332, null, null, 133, 4, 'media'),
  (508, 'passed', 1333, null, null, 133, 5, 'media'),
  (509, 'failed', 1333, null, null, 133, 6, 'media'),
  (510, 'withdrawn', 1332, null, null, 133, 7, 'media'),
  (511, 'ongoing', 1342, 'https://portfolio.example.com/media-511', '视频组', 134, 8, 'media'),
  (512, 'passed', 1343, 'https://portfolio.example.com/media-512', '设计组', 134, 9, 'media'),
  (513, 'failed', 1343, 'https://portfolio.example.com/media-513', '视频组', 134, 10, 'media'),
  (514, 'ongoing', 1352, 'https://portfolio.example.com/wod-514', '视频组', 135, 3, 'media'),
  (515, 'passed', 1353, 'https://portfolio.example.com/wod-515', '设计组', 135, 4, 'media'),
  (516, 'ongoing', 1362, 'https://portfolio.example.com/sod-516', '视频组', 136, 5, 'media'),
  (517, 'passed', 1363, 'https://portfolio.example.com/sod-517', '设计组', 136, 6, 'media'),
  (518, 'ongoing', 1372, null, null, 137, 7, 'electronics'),
  (519, 'passed', 1373, null, null, 137, 8, 'electronics'),
  (520, 'failed', 1373, null, null, 137, 9, 'electronics'),
  (521, 'ongoing', 1382, 'https://portfolio.example.com/ee-521', '硬件组', 138, 10, 'electronics'),
  (522, 'passed', 1383, 'https://portfolio.example.com/ee-522', '嵌入式组', 138, 3, 'electronics'),
  (523, 'ongoing', 1392, 'https://portfolio.example.com/ee-woc-523', '硬件组', 139, 4, 'electronics'),
  (524, 'failed', 1393, 'https://portfolio.example.com/ee-woc-524', '嵌入式组', 139, 5, 'electronics'),
  (525, 'ongoing', 1402, 'https://portfolio.example.com/ee-soc-525', '硬件组', 140, 6, 'electronics'),
  (526, 'passed', 1403, 'https://portfolio.example.com/ee-soc-526', '嵌入式组', 140, 7, 'electronics')
on conflict (id) do update set
  progress_status = excluded.progress_status,
  fk_current_step_id = excluded.fk_current_step_id,
  portfolio_link = excluded.portfolio_link,
  apply_group = excluded.apply_group,
  fk_flow_id = excluded.fk_flow_id,
  fk_user_id = excluded.fk_user_id,
  department = excluded.department;

insert into problem (
  id,
  title,
  score,
  fk_flow_step_id
) values
  (10621, '视频剪辑基础', 25, 1332),
  (10622, '视觉设计与排版', 25, 1332),
  (10623, '色彩与构图', 25, 1332),
  (10624, '开放题：作品陈述', 25, 1332),
  (11021, '数字电路基础', 25, 1372),
  (11022, '嵌入式 C 语言', 25, 1372),
  (11023, '单片机实践', 25, 1372),
  (11024, '开放题：硬件方案', 25, 1372)
on conflict (id) do update set
  title = excluded.title,
  score = excluded.score,
  fk_flow_step_id = excluded.fk_flow_step_id;

insert into user_point (
  fk_user_flow_id,
  fk_problem_id,
  points,
  note,
  fk_judger_id
) values
  (507, 10621, 20, '剪辑节奏不错，转场可以再克制一些。', 206),
  (507, 10622, 18, null, 206),
  (508, 10621, 24, '完成度高。', 206),
  (508, 10622, 23, null, 206),
  (508, 10623, 22, '配色统一，层级清楚。', 206),
  (508, 10624, 24, '作品陈述有条理。', 206),
  (509, 10621, 10, '基础操作不熟练。', 206),
  (509, 10622, 12, null, 206),
  (509, 10623, 9, null, 206),
  (509, 10624, 8, '陈述缺少重点。', 206),
  (518, 11021, 21, '基础概念清楚。', 210),
  (518, 11022, 19, null, 210),
  (519, 11021, 23, null, 210),
  (519, 11022, 24, '指针与内存部分掌握扎实。', 210),
  (519, 11023, 22, null, 210),
  (519, 11024, 21, '方案可行，成本分析略粗略。', 210),
  (520, 11021, 11, '基础不牢。', 210),
  (520, 11022, 13, null, 210),
  (520, 11023, 10, null, 210),
  (520, 11024, 9, '方案缺少关键电路说明。', 210)
on conflict (fk_user_flow_id, fk_problem_id) do update set
  points = excluded.points,
  note = excluded.note,
  fk_judger_id = excluded.fk_judger_id;

insert into interview_evaluation (
  id,
  fk_user_flow_id,
  fk_user_id,
  content,
  meeting_link,
  recommendation,
  status,
  fk_reviewed_by,
  created_at,
  updated_at
) values
  (305, 501, 202, '基础扎实，作品讲解清楚，建议进入下一阶段。', 'https://memo.example.com/demo-501', 'passed', 'submitted', null, now() - interval '1 day', now() - interval '1 day'),
  (306, 502, 202, '项目经验与团队协作都不错，已通过复核。', 'https://memo.example.com/demo-502', 'passed', 'approved', 201, now() - interval '3 days', now() - interval '2 days'),
  (307, 503, 202, '表达能力尚可，但项目完成度不足，本轮不建议通过。', 'https://memo.example.com/demo-503', 'failed', 'rejected', 201, now() - interval '3 days', now() - interval '2 days'),
  (308, 505, 202, '技术深度达到留任要求，已通过复核。', 'https://memo.example.com/demo-505', 'passed', 'approved', 201, now() - interval '2 days', now() - interval '1 day'),
  (309, 511, 206, '作品完成度高，建议通过后进入复核。', 'https://memo.example.com/demo-511', 'passed', 'submitted', null, now() - interval '10 hours', now() - interval '10 hours'),
  (310, 512, 206, '设计思路清晰，已通过复核。', 'https://memo.example.com/demo-512', 'passed', 'approved', 205, now() - interval '3 days', now() - interval '2 days'),
  (311, 513, 206, '作品与岗位要求差距较大，本轮不建议通过。', 'https://memo.example.com/demo-513', 'failed', 'rejected', 205, now() - interval '3 days', now() - interval '2 days'),
  (312, 514, 206, '请补充项目中的个人贡献与素材来源说明。', 'https://memo.example.com/demo-514', 'passed', 'returned', 205, now() - interval '12 hours', now() - interval '8 hours'),
  (313, 515, 206, '作品与实践经历匹配，已通过复核。', 'https://memo.example.com/demo-515', 'passed', 'approved', 205, now() - interval '2 days', now() - interval '1 day'),
  (314, 517, 206, '达到留任标准，已通过复核。', 'https://memo.example.com/demo-517', 'passed', 'approved', 205, now() - interval '2 days', now() - interval '1 day'),
  (315, 522, 210, '硬件基础扎实，已通过复核。', 'https://memo.example.com/demo-522', 'passed', 'approved', 209, now() - interval '2 days', now() - interval '1 day'),
  (316, 524, 210, '嵌入式基础薄弱，本轮不建议通过。', 'https://memo.example.com/demo-524', 'failed', 'rejected', 209, now() - interval '2 days', now() - interval '1 day'),
  (317, 526, 210, '项目经验满足留任要求，已通过复核。', 'https://memo.example.com/demo-526', 'passed', 'approved', 209, now() - interval '2 days', now() - interval '1 day')
on conflict (id) do update set
  fk_user_flow_id = excluded.fk_user_flow_id,
  fk_user_id = excluded.fk_user_id,
  content = excluded.content,
  meeting_link = excluded.meeting_link,
  recommendation = excluded.recommendation,
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
  location,
  meeting_room_id,
  attendee_email,
  starts_at,
  ends_at,
  timezone,
  status,
  created_at,
  updated_at
) values
  (706, 511, null, 206, 'feishu', 'demo-event-511', 'demo-reserve-511', 'demo-meeting-511', 'https://vc.feishu.cn/j/demo511', '2026 校科协多媒体部 免试招新 面试 - 吴承宇', '本地 demo：已预约，等待讲师写面评。', '教三 305', null, 'B00040008@njupt.edu.cn', now() + interval '1 day', now() + interval '25 hours', 'Asia/Shanghai', 'created', now() - interval '2 hours', now() - interval '2 hours'),
  (707, 512, 310, 206, 'feishu', 'demo-event-512', 'demo-reserve-512', 'demo-meeting-512', 'https://vc.feishu.cn/j/demo512', '2026 校科协多媒体部 免试招新 面试 - 郑一凡', '本地 demo：日程已结束，面评已通过。', '教三 305', null, 'B00040009@njupt.edu.cn', now() - interval '2 days', now() - interval '47 hours', 'Asia/Shanghai', 'created', now() - interval '3 days', now() - interval '3 days')
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
  location = excluded.location,
  meeting_room_id = excluded.meeting_room_id,
  attendee_email = excluded.attendee_email,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  timezone = excluded.timezone,
  status = excluded.status,
  updated_at = now();

/* 多媒体部笔试已发布结果：演示「部门维度的结果发布 / 导出」（含未完成与退回的候选人） */
insert into flow_result_publication (
  fk_flow_id,
  status,
  version,
  result_snapshot,
  template_snapshot,
  confirmed_by,
  confirmed_at,
  published_at,
  created_at,
  updated_at
) values (
  133,
  'published',
  1,
  jsonb_build_object(
    'flowId', 133,
    'flowTitle', '2026 多媒体部笔试 Demo',
    'rows', jsonb_build_array(
      jsonb_build_object('userFlowId', 506, 'userId', 3, 'status', 'not_started'),
      jsonb_build_object('userFlowId', 507, 'userId', 4, 'status', 'ongoing'),
      jsonb_build_object('userFlowId', 508, 'userId', 5, 'status', 'passed'),
      jsonb_build_object('userFlowId', 509, 'userId', 6, 'status', 'failed'),
      jsonb_build_object('userFlowId', 510, 'userId', 7, 'status', 'withdrawn')
    ),
    'counts', jsonb_build_object('total', 5, 'accepted', 1, 'rejected', 1, 'withdrawn', 1, 'unfinished', 2)
  ),
  '{}'::jsonb,
  1,
  now() - interval '1 day',
  now() - interval '1 day',
  now() - interval '1 day',
  now()
) on conflict (fk_flow_id) do update set
  status = excluded.status,
  version = excluded.version,
  result_snapshot = excluded.result_snapshot,
  template_snapshot = excluded.template_snapshot,
  confirmed_by = excluded.confirmed_by,
  confirmed_at = excluded.confirmed_at,
  published_at = excluded.published_at,
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
on conflict ("template_key", coalesce("department", '')) do update set
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
  '{candidateName} 同学，你已预约 {flowName} 的面试，讲师为 {organizerName}。时间为 {startsAt} - {endsAt}。',
  '南京邮电大学大学生科学技术协会',
  now()
) on conflict ("template_key", coalesce("department", '')) do update set
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
  (401, 'recruitment.result.accepted', '2026 校科协软件研发部 春季笔试招新 结果通知', true, 'completed', 1, 101, 1, now() - interval '1 day', now() - interval '1 day'),
  (402, 'recruitment.result.rejected', '2026 校科协软件研发部 春季笔试招新 结果通知', false, 'failed', 2, 101, 1, now() - interval '12 hours', now() - interval '12 hours')
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
  (501, 'B00040007@njupt.edu.cn', '2026 校科协软件研发部 春季笔试招新 结果通知', '<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,sans-serif;color:#111827;"><main style="max-width:640px;margin:32px auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;"><h1 style="margin:0 0 16px;font-size:22px;">2026 校科协软件研发部 春季笔试招新 结果通知</h1><p>欧阳文博，你已通过本轮招新。</p><p>请按通知完成后续成员信息登记。</p></main></body></html>', 'sent', null, 'demo-message-501', 401, 204, 7, now() - interval '1 day', now() - interval '1 day', now() - interval '1 day'),
  (502, 'B00040006@njupt.edu.cn', '2026 校科协软件研发部 春季笔试招新 结果通知', '<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,sans-serif;color:#111827;"><main style="max-width:640px;margin:32px auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;"><h1 style="margin:0 0 16px;font-size:22px;">2026 校科协软件研发部 春季笔试招新 结果通知</h1><p>张昊然，很遗憾本次未通过。</p><p>感谢你的参与，欢迎继续关注后续活动。</p></main></body></html>', 'failed', 'SMTP demo failure', null, 402, 203, 6, now() - interval '12 hours', null, now() - interval '12 hours'),
  (503, 'B00040008@njupt.edu.cn', '2026 校科协软件研发部 春季笔试招新 结果通知', '<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,sans-serif;color:#111827;"><main style="max-width:640px;margin:32px auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;"><h1 style="margin:0 0 16px;font-size:22px;">2026 校科协软件研发部 春季笔试招新 结果通知</h1><p>吴承宇，很遗憾本次未通过。</p><p>感谢你的参与，欢迎继续关注后续活动。</p></main></body></html>', 'sent', null, 'demo-message-503', 402, 205, 8, now() - interval '12 hours', now() - interval '12 hours', now() - interval '12 hours')
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

select setval(pg_get_serial_sequence('flow', 'id'), greatest((select coalesce(max(id), 1) from flow), 1));
select setval(pg_get_serial_sequence('flow_step', 'id'), greatest((select coalesce(max(id), 1) from flow_step), 1));
select setval(pg_get_serial_sequence('problem', 'id'), greatest((select coalesce(max(id), 1) from problem), 1));
select setval(pg_get_serial_sequence('user_flow', 'id'), greatest((select coalesce(max(id), 1) from user_flow), 1));
select setval(pg_get_serial_sequence('user_point', 'id'), greatest((select coalesce(max(id), 1) from user_point), 1));
select setval(pg_get_serial_sequence('interview_evaluation', 'id'), greatest((select coalesce(max(id), 1) from interview_evaluation), 1));
select setval(pg_get_serial_sequence('interview_schedule', 'id'), greatest((select coalesce(max(id), 1) from interview_schedule), 1));
select setval(pg_get_serial_sequence('interview_slot_change_request', 'id'), greatest((select coalesce(max(id), 1) from interview_slot_change_request), 1));
select setval(pg_get_serial_sequence('email_batch', 'id'), greatest((select coalesce(max(id), 1) from email_batch), 1));
select setval(pg_get_serial_sequence('email_delivery', 'id'), greatest((select coalesce(max(id), 1) from email_delivery), 1));
select setval(pg_get_serial_sequence('email_template_setting', 'id'), greatest((select coalesce(max(id), 1) from email_template_setting), 1));
select setval(pg_get_serial_sequence('email_template_content', 'id'), greatest((select coalesce(max(id), 1) from email_template_content), 1));
select setval(pg_get_serial_sequence('operation_audit', 'id'), greatest((select coalesce(max(id), 1) from operation_audit), 1));

commit;
