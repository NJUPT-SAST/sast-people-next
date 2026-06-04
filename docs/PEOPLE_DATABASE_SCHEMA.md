# SAST People 数据库表结构

| 项目 | 内容 |
| --- | --- |
| 文档状态 | Draft |
| 适用分支 | `v3.1` |
| 来源 | `db/schema.ts`、`migrations/0011_link_user_ids.sql`、`migrations/0012_operation_audit.sql` |
| 最后更新 | 2026-06-04 |

## 1. 边界

People v3.1 数据库只维护招新、流程、评分、面评、邮件和审计等业务数据。

用户基础资料、账号状态、角色和第三方身份绑定由 SAST Link 维护。People 业务表中的用户字段保存 Link 用户 ID，不再对旧 People `public.user.id` 建外键。

旧 `public.user` 表短期保留，仅用于 legacy fallback、本地排障和迁移校验。正常 v3.1 运行时不应把它作为用户资料数据源。

## 2. 枚举

| 枚举 | 值 | 用途 |
| --- | --- | --- |
| `flow_step_type_enum` | `registering`、`checking`、`judging`、`email`、`finished` | 流程步骤类型 |
| `flow_type_enum` | `recruitment`、`recruitment_exemption`、`woc`、`soc` | 流程类型 |
| `user_flow_status_enum` | `pending`、`accepted`、`rejected`、`ongoing`、`passed`、`failed` | 用户流程状态 |
| `evaluation_status_enum` | `pending`、`approved`、`rejected` | 面评审批状态 |
| `email_batch_status_enum` | `draft`、`queued`、`completed`、`failed` | 邮件批次状态 |
| `email_delivery_status_enum` | `pending`、`sending`、`sent`、`failed` | 单封邮件发送状态 |

## 3. 表总览

| 表 | 作用 | 用户字段口径 |
| --- | --- | --- |
| `user` | 旧 People 用户表，v3.1 不作为主数据源 | 旧 People 用户 ID |
| `flow` | 招新、WOC/SOC 等流程 | `owner_id` 保存 Link 用户 ID |
| `flow_step` | 流程步骤 | 无用户字段 |
| `user_flow` | 用户报名和流程状态 | `fk_user_id` 保存 Link 用户 ID |
| `problem` | 笔试题目 | 无用户字段 |
| `user_point` | 题目评分记录 | `fk_judger_id` 保存 Link 用户 ID |
| `interview_evaluation` | 面评记录和审批状态 | `fk_user_id`、`fk_reviewed_by` 保存 Link 用户 ID |
| `email_template_setting` | 结果邮件模板配置 | 无用户字段 |
| `email_batch` | 邮件发送批次 | `fk_created_by` 保存 Link 用户 ID |
| `email_delivery` | 单个用户邮件发送记录 | `fk_user_id` 保存 Link 用户 ID |
| `operation_audit` | 管理操作审计 | `actor_id` 保存 Link 用户 ID |

## 4. 旧用户表

### `user`

旧 People 用户表。v3.1 中保留该表是为了本地 fallback 和迁移排障，不再作为用户基础资料主数据源。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `serial` | 旧 People 用户 ID |
| `name` | `varchar(30)` | 姓名 |
| `student_id` | `varchar(16)` | 学号，唯一 |
| `email` | `varchar(254)` | 邮箱 |
| `phone` | `varchar(16)` | 手机号 |
| `college` | `varchar(50)` | 学院 |
| `major` | `varchar(50)` | 专业 |
| `department` | `varchar(50)[]` | 部门数组 |
| `github` | `text` | GitHub |
| `blog` | `text` | 博客 |
| `personal_statement` | `text` | 个人简介 |
| `qq` | `varchar(20)` | QQ |
| `link_openid` | `varchar(255)` | 旧 Link OpenID，唯一 |
| `feishu_openid` | `varchar(255)` | 旧飞书 OpenID，唯一 |
| `role` | `integer` | 旧 People 数字角色 |
| `created_at` | `timestamp` | 创建时间 |
| `updated_at` | `timestamp` | 更新时间 |
| `is_deleted` | `boolean` | 旧删除标记 |

## 5. 流程表

### `flow`

流程定义表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `serial` | 流程 ID |
| `title` | `varchar(100)` | 标题 |
| `description` | `varchar(1000)` | 描述 |
| `type` | `flow_type_enum` | 流程类型，默认 `recruitment` |
| `owner_id` | `integer` | 创建者 Link 用户 ID |
| `created_at` | `timestamp` | 创建时间 |
| `started_at` | `timestamp` | 开始时间 |
| `ended_at` | `timestamp` | 结束时间 |
| `updated_at` | `timestamp` | 更新时间 |
| `is_deleted` | `boolean` | 软删除标记 |

### `flow_step`

流程步骤表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `serial` | 步骤 ID |
| `title` | `varchar(100)` | 标题 |
| `description` | `varchar(1000)` | 描述 |
| `type` | `flow_step_type_enum` | 步骤类型 |
| `order` | `integer` | 步骤顺序 |
| `fk_flow_id` | `integer` | 关联 `flow.id` |
| `created_at` | `timestamp` | 创建时间 |
| `updated_at` | `timestamp` | 更新时间 |
| `is_deleted` | `boolean` | 软删除标记 |

### `user_flow`

用户报名和流程状态表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `serial` | 用户流程 ID |
| `status` | `user_flow_status_enum` | 当前状态，默认 `pending` |
| `current_step_order` | `integer` | 当前步骤顺序 |
| `portfolio_link` | `text` | 作品集或报名补充链接 |
| `fk_flow_id` | `integer` | 关联 `flow.id` |
| `fk_user_id` | `integer` | 报名用户 Link 用户 ID |

## 6. 笔试评分表

### `problem`

笔试题目表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `serial` | 题目 ID |
| `title` | `varchar(100)` | 题目标题 |
| `score` | `integer` | 满分 |
| `fk_flow_step_id` | `integer` | 关联 `flow_step.id` |

### `user_point`

评分记录表。`fk_user_flow_id` 和 `fk_problem_id` 组合唯一。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `serial` | 评分记录 ID |
| `fk_user_flow_id` | `integer` | 关联 `user_flow.id` |
| `fk_problem_id` | `integer` | 关联 `problem.id` |
| `points` | `integer` | 得分 |
| `fk_judger_id` | `integer` | 阅卷人 Link 用户 ID |

## 7. 面评表

### `interview_evaluation`

面评记录和管理员审批表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `serial` | 面评记录 ID |
| `fk_user_flow_id` | `integer` | 关联 `user_flow.id` |
| `fk_user_id` | `integer` | 被评价用户 Link 用户 ID |
| `content` | `text` | 面评内容 |
| `meeting_link` | `text` | 会议链接 |
| `status` | `evaluation_status_enum` | 审批状态，默认 `pending` |
| `fk_reviewed_by` | `integer` | 审批人 Link 用户 ID |
| `created_at` | `timestamp` | 创建时间 |
| `updated_at` | `timestamp` | 更新时间 |

## 8. 邮件表

### `email`

旧邮件步骤内容表，关联流程步骤。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `serial` | 邮件记录 ID |
| `subject` | `varchar(255)` | 主题 |
| `content` | `text` | 内容 |
| `fk_flow_step_id` | `integer` | 关联 `flow_step.id` |

### `email_template_setting`

结果邮件模板配置表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `serial` | 配置 ID |
| `template_key` | `varchar(80)` | 模板 key，唯一 |
| `subject_template` | `varchar(255)` | 主题模板 |
| `member_info_form_url` | `text` | 成员信息登记表链接 |
| `feishu_group_url` | `text` | 飞书群链接 |
| `calendar_url` | `text` | 日历链接 |
| `feishu_register_help_url` | `text` | 飞书注册帮助链接 |
| `contact_email` | `varchar(254)` | 联系邮箱 |
| `member_form_label` | `varchar(100)` | 登记表展示名称 |
| `feishu_group_name` | `varchar(100)` | 飞书群展示名称 |
| `updated_at` | `timestamp` | 更新时间 |

### `email_batch`

邮件发送批次表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `serial` | 批次 ID |
| `template_key` | `varchar(80)` | 模板 key |
| `subject` | `varchar(255)` | 主题 |
| `accept` | `boolean` | 是否录取结果 |
| `status` | `email_batch_status_enum` | 批次状态，默认 `queued` |
| `total_count` | `integer` | 总发送数 |
| `fk_flow_id` | `integer` | 关联 `flow.id` |
| `fk_created_by` | `integer` | 创建者 Link 用户 ID |
| `created_at` | `timestamp` | 创建时间 |
| `updated_at` | `timestamp` | 更新时间 |

### `email_delivery`

单封邮件发送记录表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `serial` | 发送记录 ID |
| `to_address` | `varchar(254)` | 收件地址 |
| `subject` | `varchar(255)` | 主题 |
| `html_snapshot` | `text` | 邮件 HTML 快照 |
| `status` | `email_delivery_status_enum` | 发送状态，默认 `pending` |
| `error_message` | `text` | 错误信息 |
| `provider_message_id` | `varchar(255)` | 邮件服务商消息 ID |
| `fk_email_batch_id` | `integer` | 关联 `email_batch.id` |
| `fk_user_flow_id` | `integer` | 关联 `user_flow.id` |
| `fk_user_id` | `integer` | 收件人 Link 用户 ID |
| `created_at` | `timestamp` | 创建时间 |
| `sent_at` | `timestamp` | 发送时间 |
| `updated_at` | `timestamp` | 更新时间 |

## 9. 审计表

### `operation_audit`

管理操作审计表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `serial` | 审计记录 ID |
| `actor_id` | `integer` | 操作者 Link 用户 ID |
| `action` | `varchar(80)` | 操作名称 |
| `resource_type` | `varchar(80)` | 资源类型 |
| `resource_id` | `integer` | 资源 ID |
| `metadata` | `jsonb` | 附加信息 |
| `created_at` | `timestamp` | 创建时间 |

索引：

- `operation_audit_actor_id_idx` on `actor_id`
- `operation_audit_resource_idx` on `resource_type, resource_id`
- `operation_audit_created_at_idx` on `created_at`

## 10. v3.1 用户 ID 迁移口径

`migrations/0011_link_user_ids.sql` 会移除以下业务表到旧 `public.user` 的外键约束：

- `flow`
- `user_flow`
- `user_point`
- `interview_evaluation`
- `email_batch`
- `email_delivery`

移除外键后，这些表的用户字段继续使用 `integer`，但运行时语义变为 Link 用户 ID。涉及字段：

- `flow.owner_id`
- `user_flow.fk_user_id`
- `user_point.fk_judger_id`
- `interview_evaluation.fk_user_id`
- `interview_evaluation.fk_reviewed_by`
- `email_batch.fk_created_by`
- `email_delivery.fk_user_id`
- `operation_audit.actor_id`

## 11. 维护原则

1. 新增或修改 People 业务表时，同步更新本文档。
2. 任何用户基础资料字段优先放到 Link，不扩展旧 `user` 表。
3. 如果未来确实需要 People 私有用户扩展字段，应新增以 Link 用户 ID 为主键或唯一键的扩展表。
4. 业务表用户字段必须明确标注保存的是 Link 用户 ID，避免和旧 People 用户 ID 混用。
