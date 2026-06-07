# SAST People 数据库表结构

| 项目 | 内容 |
| --- | --- |
| 文档状态 | Draft |
| 适用分支 | `v3.1` |
| 来源 | `db/schema.ts`、`migrations/0011_link_user_ids.sql` 至 `migrations/0023_email_delivery_flow_nullable_user.sql` |
| 最后更新 | 2026-06-07 |

## 1. 边界

People v3.1 数据库只维护招新、流程、评分、面评、邮件和审计等业务数据。

用户基础资料、账号状态、角色和第三方身份绑定由 SAST Link 维护。People 业务表中的用户字段保存 Link 用户 ID，不再对旧 People `public.user.id` 建外键。

旧 `public.user` 表短期保留，仅用于 legacy fallback、本地排障和迁移校验。正常 v3.1 运行时不应把它作为用户资料数据源。

## 2. 枚举

| 枚举 | 值 | 用途 |
| --- | --- | --- |
| `flow_step_type_enum` | `registering`、`checking`、`judging`、`email`、`finished` | 流程步骤类型 |
| `flow_type_enum` | `recruitment`、`recruitment_exemption`、`woc`、`soc` | 流程类型 |
| `progress_status_enum` | `not_started`、`ongoing`、`passed`、`failed` | 流程进行状态（报名即进流程，无需审核） |
| `evaluation_status_enum` | `submitted`、`approved`、`rejected` | 面评终审状态（讲师提交面评 → 管理员终审） |
| `email_batch_status_enum` | `draft`、`queued`、`completed`、`failed` | 邮件批次状态 |
| `email_delivery_status_enum` | `pending`、`sending`、`sent`、`failed` | 单封邮件发送状态 |
| `interview_schedule_status_enum` | `created`、`cancelled`、`failed` | 面试日程状态 |

> `progress_status` 来自旧 `user_flow_status_enum`（`pending`/`accepted`/`rejected`/`ongoing`/`passed`/`failed`）的简化，去掉报名审核维度。迁移时 `pending` → `not_started`，`accepted` → `passed`，`rejected` → `failed`，`ongoing`/`passed`/`failed` 保持原语义。

## 3. 表总览

| 表 | 作用 | 用户字段口径 |
| --- | --- | --- |
| `user` | **@deprecated** 旧 People 用户表，v3.1 不作为主数据源 | 旧 People 用户 ID |
| `flow` | 招新、WOC/SOC 等流程 | `owner_id` 保存 Link 用户 ID |
| `flow_step` | 流程步骤 | 无用户字段 |
| `user_flow` | 用户报名和流程状态 | `fk_user_id` 保存 Link 用户 ID |
| `problem` | 笔试题目 | 无用户字段 |
| `user_point` | 题目评分记录 | `fk_judger_id` 保存 Link 用户 ID |
| `interview_evaluation` | 面评记录和审批状态 | `fk_user_id` 保存 Link 用户 ID（面评撰写人）；`fk_reviewed_by` 保存 Link 用户 ID（审批人） |
| `email_template_setting` | 结果邮件模板配置 | 无用户字段 |
| `email_template_content` | 通用邮件文案模板配置 | 无用户字段 |
| `email_batch` | 邮件发送批次 | `fk_created_by` 保存 Link 用户 ID |
| `email_delivery` | 单封邮件投递记录 | `fk_user_id` 保存 Link 用户 ID，可为空（测试邮件或外部收件人） |
| `user_oauth_account` | People 私有第三方 OAuth token 绑定 | `fk_user_id` 保存 Link 用户 ID |
| `interview_schedule` | 非笔试流程面试日程和飞书会议记录 | `fk_organizer_id` 保存 Link 用户 ID |
| `operation_audit` | 管理操作审计 | `actor_id` 保存 Link 用户 ID |

## 4. 旧用户表

### `user`

**@deprecated** v3.1 中保留该表仅用于本地 legacy fallback 和迁移排障，不再作为用户基础资料主数据源。联调稳定后删除。

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
| `ended_at` | `timestamp` | 结束时间（NULL = 未结束） |
| `updated_at` | `timestamp` | 更新时间 |
| `is_deleted` | `boolean` | 软删除标记 |

> `ended_at` 创建时不设默认值，由业务操作写入。

### `flow_step`

流程步骤表。`(fk_flow_id, order)` 组合唯一。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `serial` | 步骤 ID |
| `title` | `varchar(100)` | 标题 |
| `description` | `varchar(1000)` | 描述 |
| `type` | `flow_step_type_enum` | 步骤类型 |
| `order` | `integer` | 步骤顺序 |
| `fk_flow_id` | `integer` | 关联 `flow.id`（CASCADE） |
| `created_at` | `timestamp` | 创建时间 |
| `updated_at` | `timestamp` | 更新时间 |
| `is_deleted` | `boolean` | 软删除标记 |

> 删除 `flow` 时级联删除其所有 `flow_step`。

### `user_flow`

用户报名和流程状态表。`(fk_flow_id, fk_user_id)` 组合唯一，一人对同一流程只能有一条报名记录。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `serial` | 用户流程 ID |
| `progress_status` | `progress_status_enum` | 流程进度：`not_started` → `ongoing` → `passed` / `failed` |
| `fk_current_step_id` | `integer` | 当前步骤，关联 `flow_step.id`（SET NULL on delete） |
| `portfolio_link` | `text` | 作品集或报名补充链接 |
| `fk_flow_id` | `integer` | 关联 `flow.id`（CASCADE） |
| `fk_user_id` | `integer` | 报名用户 Link 用户 ID |
| `created_at` | `timestamp` | 报名时间 |
| `updated_at` | `timestamp` | 最后更新时间 |

> 报名无需审核，报名后直接进入流程。典型生命周期：
> `not_started` → `ongoing` → `passed` / `failed`

## 6. 笔试评分表

### `problem`

笔试题目表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `serial` | 题目 ID |
| `title` | `varchar(100)` | 题目标题 |
| `score` | `integer` | 满分 |
| `fk_flow_step_id` | `integer` | 关联 `flow_step.id`（CASCADE） |

> 删除 `flow_step` 时级联删除其所有 `problem`。

### `user_point`

评分记录表。`(fk_user_flow_id, fk_problem_id)` 组合唯一。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `serial` | 评分记录 ID |
| `fk_user_flow_id` | `integer` | 关联 `user_flow.id`（CASCADE） |
| `fk_problem_id` | `integer` | 关联 `problem.id`（CASCADE） |
| `points` | `integer` | 得分 |
| `fk_judger_id` | `integer` | 阅卷人 Link 用户 ID |
| `created_at` | `timestamp` | 评分时间 |

> 删除 `user_flow` 或 `problem` 时级联删除评分记录。

## 7. 面评表

### `interview_evaluation`

面评记录和管理员终审表。讲师初审通过后提交面评（status=`submitted`），管理员统一终审（→ `approved` / `rejected`）。候选人通过 `fk_user_flow_id` → `user_flow.fk_user_id` 获取，`fk_user_id` 为面评撰写人。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `serial` | 面评记录 ID |
| `fk_user_flow_id` | `integer` | 关联 `user_flow.id`（CASCADE） |
| `fk_user_id` | `integer` | 面评撰写人 Link 用户 ID |
| `content` | `text` | 面评内容 |
| `meeting_link` | `text` | 面试结束后的妙记链接或复盘记录链接 |
| `status` | `evaluation_status_enum` | 终审状态，默认 `submitted` |
| `fk_reviewed_by` | `integer` | 审批人 Link 用户 ID |
| `created_at` | `timestamp` | 创建时间 |
| `updated_at` | `timestamp` | 更新时间 |

> 删除 `user_flow` 时级联删除面评记录。

### `interview_schedule`

非笔试流程面试预约表。飞书日程由讲师个人 OAuth token 发起，`meeting_link` 保存飞书会议链接，不自动写入面评记录。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `serial` | 日程记录 ID |
| `fk_user_flow_id` | `integer` | 关联 `user_flow.id`（CASCADE） |
| `fk_evaluation_id` | `integer` | 关联 `interview_evaluation.id`（SET NULL） |
| `fk_organizer_id` | `integer` | 日程发起讲师 Link 用户 ID |
| `provider` | `varchar(32)` | 日程服务商，默认 `feishu` |
| `provider_event_id` | `varchar(255)` | 飞书 Calendar event ID |
| `provider_reserve_id` | `varchar(255)` | 飞书 VC reserve ID |
| `provider_meeting_no` | `varchar(255)` | 飞书会议号 |
| `meeting_link` | `text` | 飞书会议链接，必须展示给讲师和面试同学 |
| `schedule_link` | `text` | 飞书日程详情链接，用于区分日程入口和会议入口 |
| `meeting_minute_link` | `text` | 飞书妙记/日程妙记链接，由飞书事件回调自动同步 |
| `summary` | `varchar(255)` | 日程标题 |
| `description` | `text` | 日程描述 |
| `location` | `varchar(255)` | 线下面试地点或补充地点说明 |
| `attendee_email` | `varchar(254)` | 候选人邮箱 |
| `starts_at` | `timestamp` | 开始时间 |
| `ends_at` | `timestamp` | 结束时间 |
| `timezone` | `varchar(64)` | 时区，默认 `Asia/Shanghai` |
| `status` | `interview_schedule_status_enum` | 状态，默认 `created` |
| `created_at` | `timestamp` | 创建时间 |
| `updated_at` | `timestamp` | 更新时间 |

索引：

- `interview_schedule_user_flow_idx` on `fk_user_flow_id`
- `interview_schedule_organizer_idx` on `fk_organizer_id`
- `interview_schedule_provider_event_uidx` unique on `provider, provider_event_id`

## 8. 邮件表

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

### `email_template_content`

通用邮件文案模板配置表。当前用于面试预约、改约和取消通知，不承载通过/不通过结果邮件语义。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `serial` | 模板配置 ID |
| `template_key` | `varchar(80)` | 模板 key，当前支持 `interview.schedule.created`、`interview.schedule.rescheduled`、`interview.schedule.cancelled`；历史 `interview.schedule` 仅作为创建通知 fallback |
| `subject_template` | `varchar(255)` | 邮件标题模板 |
| `title_template` | `varchar(255)` | 邮件正文主标题模板 |
| `body_template` | `text` | 邮件正文说明模板 |
| `footer_text` | `varchar(255)` | 邮件落款 |
| `updated_at` | `timestamp` | 更新时间 |

### `email_batch`

邮件发送批次表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `serial` | 批次 ID |
| `template_key` | `varchar(80)` | 模板 key |
| `category` | `varchar(32)` | 邮件类型，默认 `result` |
| `name` | `varchar(255)` | 批次名称 |
| `subject` | `varchar(255)` | 主题 |
| `accept` | `boolean` | 是否录取结果 |
| `status` | `email_batch_status_enum` | 批次状态，默认 `queued` |
| `total_count` | `integer` | 总发送数 |
| `fk_flow_id` | `integer` | 关联 `flow.id`（RESTRICT，可为空） |
| `fk_created_by` | `integer` | 创建者 Link 用户 ID |
| `metadata` | `jsonb` | 批次上下文，例如结果通知的 `accept` |
| `created_at` | `timestamp` | 创建时间 |
| `updated_at` | `timestamp` | 更新时间 |

### `email_delivery`

单封邮件投递记录表。结果通知、面试通知和测试邮件都在这里保存主题、正文快照、状态和关联业务对象。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `serial` | 发送记录 ID |
| `category` | `varchar(32)` | 邮件类型：`result`、`interview`、`test` |
| `template_key` | `varchar(80)` | 模板 key；测试邮件会使用原模板 key 加 `.test` 标记 |
| `to_address` | `varchar(254)` | 收件地址 |
| `subject` | `varchar(255)` | 主题 |
| `html_snapshot` | `text` | 邮件 HTML 快照 |
| `status` | `email_delivery_status_enum` | 发送状态，默认 `pending` |
| `error_message` | `text` | 错误信息 |
| `provider_message_id` | `varchar(255)` | 邮件服务商消息 ID |
| `fk_email_batch_id` | `integer` | 关联 `email_batch.id`（CASCADE，可为空） |
| `fk_flow_id` | `integer` | 关联 `flow.id`（RESTRICT，可为空） |
| `fk_user_flow_id` | `integer` | 关联 `user_flow.id`（SET NULL — 删除报名记录时保留邮件审计） |
| `fk_user_id` | `integer` | 收件人 Link 用户 ID，可为空 |
| `related_schedule_id` | `integer` | 关联面试预约 ID，可为空 |
| `created_by` | `integer` | 创建该投递记录的 Link 用户 ID，可为空 |
| `metadata` | `jsonb` | 投递上下文，例如测试邮件原模板 key、流程 ID、通知类型 |
| `created_at` | `timestamp` | 创建时间 |
| `sent_at` | `timestamp` | 发送时间 |
| `updated_at` | `timestamp` | 更新时间 |

索引：

- `email_delivery_created_at_idx` on `created_at`
- `email_delivery_filter_idx` on `category, template_key, status`
- `email_delivery_fk_flow_id_idx` on `fk_flow_id`

## 9. OAuth 与审计表

### `user_oauth_account`

People 私有 OAuth token 绑定表。当前用于保存讲师飞书 `user_access_token` / `refresh_token`，token 入库前由服务端加密。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `serial` | 绑定记录 ID |
| `fk_user_id` | `integer` | Link 用户 ID |
| `provider` | `varchar(32)` | OAuth 服务商，当前为 `feishu` |
| `provider_user_id` | `varchar(255)` | 服务商用户 ID，飞书为 `open_id` |
| `provider_union_id` | `varchar(255)` | 飞书 `union_id` |
| `access_token` | `text` | 加密后的 access token |
| `refresh_token` | `text` | 加密后的 refresh token |
| `access_token_expires_at` | `timestamp` | access token 过期时间 |
| `refresh_token_expires_at` | `timestamp` | refresh token 过期时间 |
| `created_at` | `timestamp` | 创建时间 |
| `updated_at` | `timestamp` | 更新时间 |

唯一约束：

- `(fk_user_id, provider)`
- `(provider, provider_user_id)`

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

## 10. 外键删除策略

业务表的外键约束使用 CASCADE 保证引用完整性，邮件表使用 RESTRICT / SET NULL 保留审计：

```
flow ──RESTRICT──► email_batch ──CASCADE──► email_delivery
  │                     │                         │
  │                     └──RESTRICT───────────────┤
  ├──CASCADE──► flow_step ──CASCADE──► problem    │
  │                │                              │
  │                └──SET NULL──► user_flow.fk_current_step_id
  │                                               │
  └──CASCADE──► user_flow ◄──SET NULL─────────────┘
                   │
                   ├──CASCADE──► user_point
                   ├──CASCADE──► interview_evaluation
                   ├──CASCADE──► interview_schedule
                   │
                   └── 业务表 user ID 字段无 DB 级 FK（用户数据在 Link）
```

| 关系 | 策略 | 理由 |
|------|------|------|
| `flow` → `email_batch` | RESTRICT | 防止误删有邮件记录的流程 |
| `email_batch` → `email_delivery` | CASCADE | 删除批次时级联清理所有发送记录 |
| `flow` → `email_delivery` | RESTRICT | 单封面试/测试邮件可直接关联流程，保留审计 |
| `email_delivery` → `user_flow` | SET NULL | 删除报名记录时保留审计，解除关联 |
| 其他业务表 → 父表 | CASCADE | 父记录删除时级联清理子数据 |
| `user_flow.fk_current_step_id` → `flow_step` | SET NULL | step 被物理删除后不阻断用户流程 |
| `interview_schedule.fk_evaluation_id` → `interview_evaluation` | SET NULL | 删除或重建面评时保留已创建日程记录 |

## 11. v3.1 用户 ID 迁移口径

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
- `interview_evaluation.fk_reviewed_by`
- `email_batch.fk_created_by`
- `email_delivery.fk_user_id`
- `user_oauth_account.fk_user_id`
- `interview_schedule.fk_organizer_id`
- `operation_audit.actor_id`

## 12. 维护原则

1. 新增或修改 People 业务表时，同步更新本文档。
2. 任何用户基础资料字段优先放到 Link，不扩展旧 `user` 表。
3. 如果未来确实需要 People 私有用户扩展字段，应新增以 Link 用户 ID 为主键或唯一键的扩展表。
4. 业务表用户字段必须明确标注保存的是 Link 用户 ID，避免和旧 People 用户 ID 混用。
5. 第三方 OAuth token 属于 People 私有业务凭据，必须加密保存，不写入 session 或客户端。
