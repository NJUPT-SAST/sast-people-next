# 飞书面试日程接入实现方案

| 项目 | 内容 |
| --- | --- |
| 文档状态 | Implementing |
| 适用范围 | SAST People v3.1 |
| 最后更新 | 2026-06-05 |
| 相关模块 | Link 登录、飞书 OAuth、面评、邮件发送 |

## 1. 目标

People 的非笔试流程需要支持面试日程预约，包括：

- 讲师在 People 中预约面试；
- People 创建飞书日程和飞书会议；
- People 保存飞书日程 ID、会议链接和面试时间；
- 面试者收到邮件，邮件中展示面试时间、流程信息、讲师信息和会议链接；
- 后续接入飞书应用事件时，可以复用同一套身份绑定和日程记录。

该功能需要同时支持两种入口：

- 用户从网页通过 SAST Link 进入 People；
- 用户从飞书应用进入 People。

## 2. 核心原则

People 的业务身份必须统一使用 SAST Link 用户 ID。

飞书身份不是新的 People 用户身份，而是绑定在 Link 用户上的一种 OAuth 能力。用户即使从飞书应用进入 People，也必须先解析到 Link 用户 ID，才能继续执行 People 业务操作。

不要在这个功能里继续把旧 `public.user.id` 当作 session `uid` 使用。

## 2.1 当前实现状态

截至 2026-06-05，当前代码已经落地：

- 讲师飞书 OAuth 绑定，token 按 Link 用户 ID 加密持久化到 `user_oauth_account`；
- 预约时使用讲师个人 `user_access_token` 创建飞书会议预约和主日历日程；
- 创建前调用飞书 Calendar v4 `freebusy.list` 检查讲师主日历忙闲状态，只有确认时间冲突时阻断预约；
- 创建日程后写入 `interview_schedule`，会议链接只保存在日程表；
- 面试通知邮件使用独立 `interview.schedule` 模板，支持在邮件管理页编辑和预览；
- 预约成功后通过飞书 IM v1 给讲师发送机器人单聊提醒，提醒失败不影响预约结果；
- People 内改约会同步更新飞书会议预约和飞书日程，并重发候选人邮件；
- People 内取消预约会同步删除飞书日程和飞书会议预约，并把本地日程标记为 `cancelled`；
- 面试结束后讲师可以在面评弹窗中调用飞书 `calendar.event.meeting_minute.create` 生成妙记链接，并自动填入面评链接字段；
- 飞书事件回调 `/api/feishu/events` 已接入会议结束事件，收到 `vc.meeting.meeting_ended_v1` 或 `vc.meeting.all_meeting_ended_v1` 后会按 `calendar_event_id` 自动生成妙记并写入日程；
- 面评 UI 按“先预约、日程结束后再写面评”的流程展示。

仍未落地：

- 飞书应用入口自动解析 Link 用户并创建 People session；

以上未落地项需要继续对接飞书开放平台能力和业务交互。

## 3. 当前代码现状

已有基础：

- `lib/session.ts` 已预留 `feishuAccessToken`、`feishuRefreshToken`、`feishuAccessTokenExpiresAt` 字段；
- `action/user/feishu.ts` 已有用飞书 code 换用户 access token 的函数；
- `interview_evaluation.meeting_link` 当前保留为面试结束后的妙记链接字段；
- `components/recruitment/evaluationTable.tsx` 已有面评内容和妙记链接输入；
- 邮件系统已有模板渲染和发送记录能力。

当前缺口：

- 飞书用户 token 没有真正持久化；
- 飞书身份没有绑定到 Link 用户 ID；
- 当前飞书登录启用时仍走 legacy People 本地用户身份；
- 没有读取或刷新飞书用户 token 的封装；
- 没有飞书 Calendar API 封装；
- 没有独立的面试日程表；
- 现有结果邮件模板不适合复用为面试通知邮件。

## 4. 身份和授权模型

### 4.0 飞书开发者平台配置

当前实现依赖同一个飞书自建应用，需要在开发者平台完成：

- 配置 `APP_ID`、`APP_SECRET`；
- OAuth 重定向地址精确加入白名单，例如本地开发为 `http://localhost:3000/api/auth/feishu`；
- 开通日历权限，用于创建日程、添加参与人、查询忙闲；
- 开通视频会议预约权限，用于创建飞书会议；
- 开启机器人能力，并开通发送消息权限，用于向讲师发送预约提醒；
- 配置事件订阅回调地址，例如 `https://<people-host>/api/feishu/events`；
- 订阅 `vc.meeting.meeting_ended_v1` 或 `vc.meeting.all_meeting_ended_v1`；
- 配置 `FEISHU_EVENT_VERIFICATION_TOKEN` 和可选的 `FEISHU_EVENT_ENCRYPT_KEY`；
- 发布或安装应用到目标组织，使讲师对该机器人具备可用性。

如果日历忙闲查询权限未配置，People 会记录错误但不阻断预约；如果查询结果确认讲师该时间段已有忙碌日程，则阻断预约。

### 4.1 从 Link 网页进入

1. 用户通过 SAST Link 登录 People。
2. People session 中保存 `uid = Link user id`。
3. 讲师预约面试时，People 检查该 Link 用户是否已绑定飞书 OAuth。
4. 如果未绑定，前端展示“授权飞书日历”入口。
5. 授权完成后，把飞书 `open_id`、`union_id`、`access_token`、`refresh_token` 和过期时间绑定到当前 Link 用户 ID。

### 4.2 从飞书应用进入

1. 飞书应用获取 auth code。
2. People 后端用 code 换飞书用户 token 和飞书用户身份。
3. People 用飞书 `union_id` / `open_id` 查找已绑定的 Link 用户 ID。
4. 如果已绑定，创建正常 People session，`uid = Link user id`。
5. 如果未绑定，要求用户通过 Link 登录一次完成绑定。

### 4.3 为什么讲师个人发起必须走用户 OAuth

如果产品要求飞书日程的组织者就是讲师本人，People 创建日程时必须使用该讲师的飞书 `user_access_token`。

使用 `tenant_access_token` 可以创建应用身份或共享日历身份的日程，但不能让讲师个人成为日程组织者。

## 5. 数据模型

### 5.1 `user_oauth_account`

用于保存 Link 用户的第三方 OAuth 绑定。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | serial | 主键 |
| `fk_link_user_id` | integer | Link 用户 ID |
| `provider` | varchar | 当前为 `feishu` |
| `provider_user_id` | varchar | 飞书 `open_id` |
| `union_id` | varchar nullable | 飞书 `union_id` |
| `access_token_ciphertext` | text | 加密后的飞书 access token |
| `refresh_token_ciphertext` | text nullable | 加密后的飞书 refresh token |
| `expires_at` | timestamp nullable | access token 过期时间 |
| `scopes` | text[] | 已授权 scope |
| `created_at` | timestamp | 默认当前时间 |
| `updated_at` | timestamp | 默认当前时间 |

建议约束：

- `(provider, provider_user_id)` 唯一；
- 当 `union_id` 存在时，`(provider, union_id)` 唯一；
- 为 `(provider, fk_link_user_id)` 建索引。

安全要求：

- token 字段必须加密存储；
- 日志中禁止输出 token；
- token 不允许传给客户端组件。

### 5.2 `interview_schedule`

用于保存飞书日程和会议元数据。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | serial | 主键 |
| `fk_user_flow_id` | integer | 关联 `user_flow.id` |
| `fk_interview_evaluation_id` | integer nullable | 关联 `interview_evaluation.id` |
| `fk_created_by` | integer | 创建讲师的 Link 用户 ID |
| `starts_at` | timestamp | 面试开始时间 |
| `ends_at` | timestamp | 面试结束时间 |
| `timezone` | varchar | 默认 `Asia/Shanghai` |
| `feishu_calendar_id` | varchar | 飞书 calendar ID |
| `feishu_event_id` | varchar | 飞书 event ID |
| `feishu_meeting_url` | text | 飞书会议链接 |
| `meeting_minute_link` | text nullable | 飞书妙记/日程妙记链接 |
| `status` | varchar | `scheduled`、`cancelled`、`failed` |
| `email_sent_at` | timestamp nullable | 面试通知邮件发送时间 |
| `created_at` | timestamp | 默认当前时间 |
| `updated_at` | timestamp | 默认当前时间 |

建议约束：

- 每个 `fk_user_flow_id` 同一时间只允许一个 active schedule；
- 为 `fk_created_by` 建索引；
- 为 `(feishu_calendar_id, feishu_event_id)` 建索引。

### 5.3 与 `interview_evaluation.meeting_link` 的边界

短期保留 `interview_evaluation.meeting_link`，但语义调整为面试结束后的妙记链接或复盘记录链接。

创建日程后只写入：

- `interview_schedule.feishu_meeting_url`。

不要把飞书会议链接自动写入 `interview_evaluation.meeting_link`。讲师应在面试结束后提交面评时填写妙记链接。

## 6. 后端模块

### 6.1 飞书 token 读取模块

新增 `lib/feishu/session.ts`。

职责：

- 根据 Link 用户 ID 读取飞书 OAuth 绑定；
- token 即将过期时刷新；
- 返回可用的 `user_access_token`；
- 刷新成功后更新持久化 token；
- 授权缺失时抛出明确错误。

建议 API：

```ts
export class MissingFeishuAuthorizationError extends Error {}

export async function getFeishuAccessTokenForLinkUser(
  linkUserId: number,
): Promise<string>;
```

### 6.2 飞书 OAuth 绑定模块

新增 `lib/feishu/oauth-binding.ts`。

职责：

- 用 auth code 换飞书用户 token；
- 获取飞书用户身份；
- 把飞书身份绑定到当前 Link 用户；
- 飞书应用入口中，用飞书身份反查 Link 用户。

建议 API：

```ts
export async function bindFeishuAccountToCurrentLinkUser(code: string): Promise<void>;

export async function resolveLinkUserFromFeishuCode(code: string): Promise<{
  linkUserId: number;
  name: string;
  role: number;
} | null>;
```

### 6.3 飞书日历模块

新增 `lib/feishu/calendar.ts`。

职责：

- 创建飞书日程；
- 在日程中创建飞书会议；
- 后续迭代中支持添加参与人、取消日程、修改日程。

建议 API：

```ts
export async function createFeishuInterviewEvent(params: {
  accessToken: string;
  calendarId: string;
  summary: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
}): Promise<{
  calendarId: string;
  eventId: string;
  meetingUrl: string;
}>;
```

实现要点：

- 使用飞书 VC v1 `reserve.apply` 创建会议预约，取得会议链接；
- 使用飞书 Calendar v4 `calendarEvent.create` 创建主日历日程；
- 日程中写入 `vchat` 的第三方会议链接，会议链接来自飞书会议预约；
- 使用 Calendar v4 `freebusy.list` 在创建前检查讲师主日历忙闲状态；
- 使用 Calendar v4 `calendarEventAttendee.create` 添加候选人教育邮箱作为第三方参与人。

官方参考：

- 创建日程：https://open.feishu.cn/document/server-docs/calendar-v4/calendar-event/create?lang=zh-CN
- 更新日程：https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/calendar-v4/calendar-event/patch
- 删除日程：https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/calendar-v4/calendar-event/delete
- 日程资源：https://open.feishu.cn/document/server-docs/calendar-v4/calendar-event/introduction
- 添加日程参与人：https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/calendar-v4/calendar-event-attendee/create
- 查询主日历忙闲信息：https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/calendar-v4/freebusy/list
- 预约会议：https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/vc-v1/reserve/apply
- 更新预约：https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/vc-v1/reserve/update
- 删除预约：https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/vc-v1/reserve/delete
- 发送消息：https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/create
- 创建日程妙记：https://open.feishu.cn/api-explorer?from=op_doc_tab&apiName=create&project=calendar&resource=calendar.event.meeting_minute&version=v4

## 7. People Server Actions

### 7.1 预约面试

在 `action/user-flow/evaluation.ts` 中新增或扩展 server action。

建议 API：

```ts
export async function scheduleInterview(params: {
  userFlowId: number;
  startsAt: Date;
  endsAt: Date;
  content?: string;
  note?: string;
}): Promise<{
  success: true;
  scheduleId: number;
  meetingUrl: string;
} | {
  success: false;
  error: { message: string; code?: string };
}>;
```

流程：

1. `verifyRole(2)`；
2. 读取 `user_flow`、`flow` 和候选人 Link 用户信息；
3. 校验流程类型必须是非笔试流程；
4. 根据当前讲师 Link 用户 ID 获取飞书 `user_access_token`；
5. 创建飞书日程和会议；
6. 写入或更新 `interview_schedule`；
7. 发送面试通知邮件；
8. 写入 operation audit；
9. revalidate 招新页。

预约面试不创建或更新面评记录。面评必须在预约日程结束后由讲师单独提交。

### 7.2 授权缺失处理

如果抛出 `MissingFeishuAuthorizationError`：

- server action 返回结构化错误，例如 `FEISHU_AUTH_REQUIRED`；
- 前端展示“授权飞书日历”入口；
- 不要只展示泛化的“操作失败”。

## 8. 邮件

### 8.1 新增面试通知模板

新增 `emails/interview-invite.tsx`。

模板变量：

- 候选人姓名；
- 流程名称；
- 讲师姓名；
- 面试开始时间；
- 面试结束时间；
- 时区；
- 会议链接；
- 可选备注；
- 联系邮箱。

### 8.2 渲染模块

新增 `lib/email/interview-invite.tsx`。

建议 API：

```ts
export async function renderInterviewInviteEmail(params: {
  candidateName: string;
  flowName: string;
  lecturerName: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  meetingUrl: string;
  note?: string;
}): Promise<string>;
```

### 8.3 发送方式

不要把面试通知伪装成结果邮件。

可选方案：

- 泛化现有 `email_batch` 和 `email_delivery`，支持 `templateKey = "interview.invite"`，并去掉结果邮件专属的 `accept` 语义；
- 第一版新增一个独立的面试通知发送 action，只写入必要发送日志。

不要用 `email_batch.accept = false` 来假装面试通知是不通过邮件。

### 8.4 前端预览和配置

面试通知邮件第一版可以先使用固定模板，但后续应接入前端配置能力：

- 在邮件管理页新增“面试预约通知”模板入口；
- 支持预览真实渲染效果；
- 支持编辑标题、正文说明、备注提示和落款等非结构化文案；
- 保留系统变量占位符，例如候选人姓名、流程名称、讲师姓名、开始时间、结束时间和会议链接；
- 保存模板配置时校验必需变量，避免误删会议链接或时间信息；
- 支持发送测试邮件到指定南邮邮箱。

该能力不应复用结果邮件的 `accept/rejected` 语义。推荐新增独立的 `interview.schedule` 模板 key，或先扩展 `email_template_setting` 支持更多模板类型。

当前实现已经新增 `email_template_content`，邮件管理页可以编辑和预览 `interview.schedule` 的标题、主标题、正文说明和落款。保存时会校验必需变量，避免误删候选人、流程、讲师、时间和会议链接等信息。

## 9. 前端改动

### 9.1 面评候选人表

修改 `components/recruitment/evaluationTable.tsx`：

- 在候选人行上新增“预约面试”按钮，打开开始时间、结束时间和备注输入；
- 创建成功后在候选人行展示飞书会议链接和面试时间；
- 预约日程结束前，不展示“通过”“不通过”面评操作；
- 预约日程结束后，展示“通过”“不通过”；提交待审批面评后展示“修改”；
- 面评弹窗只保留面评内容和妙记链接输入；
- 如果缺少飞书授权，展示“授权飞书日历”入口。

### 9.2 授权入口

新增飞书授权路由或 action：

- 从 Link 网页进入时，跳转到飞书 OAuth 授权；
- 从飞书应用进入时，使用飞书应用 code 流程；
- 绑定完成后回到预约面试 UI。

## 10. 路由建议

建议新增：

- `GET /api/auth/feishu/bind`
  - 把飞书 OAuth 绑定到当前 Link session；
  - 要求当前已有 Link session。

- `GET /api/auth/feishu/entry`
  - 飞书应用入口；
  - 用飞书身份解析 Link 用户；
  - 创建 `uid = Link user id` 的 People session；
  - 未绑定时跳转到 Link 登录并完成绑定。

现有 `GET /api/auth/feishu` legacy 路由不应再为这个功能创建基于本地 `public.user.id` 的 People session。

## 11. 落地阶段

### Phase 1：绑定和预约 MVP

- 新增 OAuth 绑定表；
- 新增飞书 token 读取和刷新 helper；
- 新增飞书日程创建 helper；
- 新增面试日程表；
- 新增预约面试 action；
- 新增面试通知邮件模板；
- 更新非笔试面评 UI。

### Phase 2：改期和取消

- 支持修改面试时间；
- 更新飞书日程；
- 重发通知邮件；
- 支持取消日程和审计记录。

当前已落地：改约会同步 `vc.reserve.update` 和 `calendarEvent.patch`，取消会同步 `calendarEvent.delete` 和 `vc.reserve.delete`。

### Phase 3：飞书应用事件

- 新增飞书事件回调 endpoint；
- 校验回调签名；
- 用飞书 event ID 映射到 `interview_schedule`；
- 根据需要更新日程状态或保存会议产物。

当前已落地：`POST /api/feishu/events` 使用飞书 SDK `EventDispatcher` 处理 URL verification、verification token 和加密事件；会议结束事件会按 `calendar_event_id` 自动生成妙记并写入 `interview_schedule.meeting_minute_link`，若已有空妙记的面评记录则同步补到 `interview_evaluation.meeting_link`。

### Phase 4：飞书体验优化

- 飞书工作台入口：从飞书应用进入 People，并解析到 Link 用户；
- 飞书消息提醒：预约成功提醒已接入；改约、面试前提醒、面评待提交提醒待接入；
- 飞书日程修改和取消：People 内改约或取消时同步飞书日程，已接入；
- 妙记链接回填：面评弹窗内手动生成妙记链接已接入；会议结束事件驱动的自动回填已接入；
- 讲师飞书绑定状态展示：预约弹窗已展示是否绑定和 token 过期时间；
- 日程冲突提示：已在创建前检查讲师个人日历忙闲状态；
- 操作失败补偿：飞书创建成功但邮件失败时保留日程记录并提示补发。

## 12. 风险和决策点

### 12.1 候选人是否作为飞书参与人

候选人可能没有飞书账号，也可能不在同一个租户内。People 必须自己发送邮件通知，不能只依赖飞书参与人通知。

### 12.2 token 存储

只存在 session 中不够稳定，因为用户可能从 Link 网页和飞书应用两个入口进入。飞书 OAuth token 应按 Link 用户 ID 持久化存储，并加密。

### 12.3 日程组织者语义

如果产品要求日程组织者是讲师本人，必须使用讲师的飞书 `user_access_token`。

如果可以接受 SAST 共享日历作为组织者，可以使用 `tenant_access_token` 和共享日历。这样实现更简单，但组织者语义不同。

### 12.4 当前 legacy 飞书登录

当前 legacy 飞书登录路径不能直接复用。它会基于旧 People 用户创建 session，并且会丢弃飞书 token。该路径应替换为“飞书授权绑定 Link 用户”的逻辑。

## 13. 验收标准

- 讲师从 Link 网页进入时，可以授权飞书并预约面试；
- 讲师从飞书应用进入时，绑定 Link 用户后可以预约面试；
- 使用用户 OAuth 创建日程时，飞书日程组织者是讲师本人；
- People 保存 `calendar_id`、`event_id`、会议链接、开始/结束时间和创建讲师 Link 用户 ID；
- 面试者收到包含会议链接和面试时间的邮件；
- 预约失败时，讲师能看到明确错误，服务端有日志；
- 飞书 token 不会出现在客户端代码、页面数据或日志中。
