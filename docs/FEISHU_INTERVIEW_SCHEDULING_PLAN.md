# 飞书面试日程接入实现方案

| 项目 | 内容 |
| --- | --- |
| 文档状态 | Implementing |
| 适用范围 | SAST People v3.1 |
| 最后更新 | 2026-06-06 |
| 相关模块 | Link 登录、飞书 OAuth、面评、邮件发送 |

## 1. 目标

People 的非笔试流程需要支持面试日程预约，包括：

- 讲师在 People 中预约面试；
- People 为线下面试创建内部飞书日程和留档会议；
- People 保存飞书日程 ID、日程链接、会议链接和面试时间；
- 面试同学收到邮件，邮件中展示线下面试时间、地点、流程信息和讲师信息，不展示飞书会议或日程链接；
- 后续接入飞书应用事件时，可以复用同一套身份绑定和日程记录。

该功能需要支持两种打开入口，但登录入口只有一种：

- 用户从网页通过 SAST Link 进入 People；
- 用户从飞书网页应用打开 People dashboard，未登录时仍跳转到 SAST Link 登录。

## 2. 核心原则

People 的业务身份必须统一使用 SAST Link 用户 ID，登录流程必须全部走 SAST Link。

飞书身份不是新的 People 用户身份，而是绑定在 Link 用户上的一种 OAuth 能力。飞书网页应用只负责打开 People，不负责创建 People session。

不要在这个功能里继续把旧 `public.user.id` 当作 session `uid` 使用。
不要实现飞书免登或通过飞书身份自动创建 People session。

## 2.1 当前实现状态

截至 2026-06-05，当前代码已经落地：

- 讲师飞书 OAuth 绑定，token 按 Link 用户 ID 加密持久化到 `user_oauth_account`；
- 登录流程统一走 SAST Link；讲师及以上进入 dashboard 后在侧边栏底部展示飞书授权状态和绑定入口；
- 预约时使用讲师个人 `user_access_token` 创建飞书会议和主日历日程；
- 创建前调用飞书 Calendar v4 `freebusy.list` 检查讲师主日历忙闲状态，只有确认时间冲突时阻断预约；
- 创建日程后写入 `interview_schedule`，并保存飞书日程 ID、会议唯一 ID、会议链接和日程链接；
- 面试通知邮件使用独立 `interview.schedule` 模板，支持邮件管理页编辑、预约前预览、改约/取消状态展示；候选人邮件只表达线下到场安排；
- 非生产环境邮件会重定向到 `EMAIL_TEST_RECIPIENT`，默认 `b24150524@njupt.edu.cn`；
- 飞书授权成功、预约成功、改约、取消、面试前提醒、面评待提交和妙记同步后会通过飞书 IM v1 给讲师发送机器人卡片提醒，提醒失败不影响主流程；
- 如果配置 `FEISHU_INTERVIEW_CHAT_ID`，预约、改约和取消会同步发送隐私收敛后的群卡片，不包含手机号和备注；
- People 内改约会同步更新飞书会议预约和飞书日程，并重发候选人邮件；
- People 内取消预约会同步删除飞书日程和飞书会议预约，并把本地日程标记为 `cancelled`；
- 妙记由飞书自动生成，People 通过飞书 `minutes.minute.generated_v1` 事件回调回填日程和对应面评档案，不要求讲师手动填写；
- 飞书事件回调 `/api/feishu/events` 已接入会议结束事件和妙记生成事件；会议结束会更新日程的真实结束状态，妙记会按会议唯一 ID 回填链接，重复事件不会重复通知；
- 面评 UI 按“先预约线下面试、确认结束后由讲师提交面评与建议、管理员终审”的流程展示；讲师可在事件回调缺失时手动确认已结束。面评正文为必填项，讲师建议通过和建议不通过都会留档；管理员归档页仅保留有完整面评的管理员决策，并支持筛选检索。归档后的最终决定不可撤销或改判。通过后的权限调整走成员管理，不通过后须重新报名并完整走流程。

仍需外部配合：

- 正式 Link OAuth/API 未就绪时，线上不能作为正式可用登录链路，只能使用本地 mock 做飞书和流程联调；

以上依赖需要继续对接 Link 和飞书开放平台配置。

## 3. 当前代码现状

已有基础：

- `lib/feishu/user-auth.ts` 使用飞书 Node SDK 交换和刷新用户 access token；
- `lib/feishu/oauth-account.ts` 已按 Link 用户 ID 持久化飞书 OAuth token；
- `interview_evaluation.meeting_link` 当前保留为面试结束后的妙记链接字段；
- `components/recruitment/evaluationTable.tsx` 已有面评内容输入，并展示飞书事件自动同步的妙记链接；
- 邮件系统已有模板渲染和发送记录能力。

当前缺口：

- 真实 Link lark identity 未就绪时，需要使用本地测试开关绕过 union_id 匹配做飞书功能联调。

## 4. 身份和授权模型

### 4.0 飞书开发者平台配置

当前实现依赖同一个飞书自建应用，需要在开发者平台完成：

- 配置 `APP_ID`、`APP_SECRET`；
- OAuth 重定向地址精确加入白名单，例如本地开发为 `http://localhost:3000/api/auth/feishu`，线上为 `https://people.sast.fun/api/auth/feishu`；
- 网页应用能力的桌面端主页和移动端主页配置为 People dashboard，例如 `https://people.sast.fun/dashboard`；
- 开通日历权限，用于创建日程、添加参与人、查询忙闲；
- 开通视频会议预约权限，用于创建飞书会议；
- 开启机器人能力，并开通发送消息权限，用于向讲师发送预约提醒；
- 配置事件订阅回调地址，例如 `https://<people-host>/api/feishu/events`；
- 订阅项目应用可用的会议结束事件和 `minutes.minute.generated_v1`；发布前需用飞书事件调试确认实际 event key 与 payload 字段，并覆盖 `vc.meeting.participant_meeting_ended_v1` 兼容路径；
- 配置 `FEISHU_EVENT_VERIFICATION_TOKEN` 和可选的 `FEISHU_EVENT_ENCRYPT_KEY`；
- 配置 `PEOPLE_PUBLIC_BASE_URL`，用于飞书卡片中的 People 直达按钮；
- 可选配置 `FEISHU_INTERVIEW_CHAT_ID`，用于向指定群发送面试日程概览；
- 发布或安装应用到目标组织，使讲师对该机器人具备可用性。

如果日历忙闲查询权限未配置，People 会记录错误但不阻断预约；如果查询结果确认讲师该时间段已有忙碌日程，则阻断预约。

### 4.1 从 Link 网页进入

1. 用户通过 SAST Link 登录 People。
2. People session 中保存 `uid = Link user id`。
3. 如果用户身份为讲师及以上，dashboard 侧边栏底部展示飞书 OAuth 绑定状态。
4. 如果未绑定，讲师在 dashboard 侧边栏底部完成飞书授权；授权入口不放在预约邮件或预约弹窗中。
5. 授权完成后，把飞书 `open_id`、`union_id`、`access_token`、`refresh_token` 和过期时间绑定到当前 Link 用户 ID。

### 4.2 从飞书网页应用打开

1. 飞书网页应用打开 People dashboard。
2. 如果当前浏览器已有 People session，直接进入 dashboard。
3. 如果没有 People session，People 跳转到 `/login`。
4. 用户必须通过 SAST Link 登录。
5. 登录成功后，讲师及以上可以在侧边栏底部绑定飞书授权。

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
| `fk_organizer_id` | integer | 创建讲师的 Link 用户 ID |
| `starts_at` | timestamp | 面试开始时间 |
| `ends_at` | timestamp | 面试结束时间 |
| `timezone` | varchar | 默认 `Asia/Shanghai` |
| `feishu_calendar_id` | varchar | 飞书 calendar ID |
| `feishu_event_id` | varchar | 飞书 event ID |
| `provider_meeting_id` | varchar nullable | 飞书会议唯一 ID，用于关联会议结束和妙记事件 |
| `meeting_link` | text | 飞书会议链接 |
| `schedule_link` | text nullable | 飞书日程详情链接 |
| `meeting_minute_link` | text nullable | 飞书妙记/日程妙记链接 |
| `status` | varchar | `created`、`cancelled`、`failed` |
| `meeting_status` | varchar | `scheduled`、`ended` |
| `meeting_ended_at` | timestamp nullable | 飞书会议实际结束时间或讲师手动确认时间 |
| `email_sent_at` | timestamp nullable | 面试通知邮件发送时间 |
| `created_at` | timestamp | 默认当前时间 |
| `updated_at` | timestamp | 默认当前时间 |

建议约束：

- 每个 `fk_user_flow_id` 同一时间只允许一个 active schedule（数据库部分唯一索引）；
- 为 `fk_organizer_id` 建索引；
- 为 `(feishu_calendar_id, feishu_event_id)` 建索引。

### 5.3 与 `interview_evaluation.meeting_link` 的边界

短期保留 `interview_evaluation.meeting_link`，但语义调整为面试结束后的妙记链接或复盘记录链接。

创建日程后只写入：

- `interview_schedule.meeting_link`；
- `interview_schedule.schedule_link`。

不要把飞书会议链接自动写入 `interview_evaluation.meeting_link`。`interview_evaluation.meeting_link` 只保留面试结束后的妙记链接或复盘记录链接；当前妙记优先由飞书事件自动同步。

## 6. 后端模块

### 6.1 飞书 token 读取模块

当前实现位于 `lib/feishu/oauth-account.ts`。

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

当前实现位于 `action/user/feishuOAuth.ts`、`app/api/auth/feishu/route.ts` 和 `lib/feishu/user-auth.ts`。

职责：

- 用 auth code 换飞书用户 token；
- 获取飞书用户身份；
- 把飞书身份绑定到当前 Link 用户；
- 绑定前校验飞书身份与当前 Link 账号的 lark identity 一致。

建议 API：

```ts
export async function bindFeishuAccountToCurrentLinkUser(code: string): Promise<void>;
```

### 6.3 飞书日历模块

当前实现位于 `lib/feishu/interview-schedule.ts`。

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
  scheduleUrl?: string;
}>;
```

实现要点：

- 使用飞书 Calendar v4 `calendarEvent.create` 创建主日历日程，并从日程 `vchat` 取得留档会议链接；候选人不是飞书日程参与人；
- 飞书 VC v1 `reserve.apply` 在当前租户可能返回不支持时，不作为唯一会议创建路径；
- 使用 Calendar v4 `freebusy.list` 在创建前检查讲师主日历忙闲状态；
- 使用 Calendar v4 `calendarEventAttendee.create` 添加讲师本人作为参与者；候选人可能没有组织内飞书账号，因此候选人通知以 People 邮件为准。

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
- dashboard 侧边栏底部授权状态展示“绑定飞书”入口；
- 不要只展示泛化的“操作失败”。

## 8. 邮件

### 8.1 新增面试通知模板

当前模板为 `emails/interview-schedule.tsx`。

模板变量：

- 候选人姓名；
- 流程名称；
- 讲师姓名；
- 面试开始时间；
- 面试结束时间；
- 时区；
- 可选备注；
- 联系邮箱。

### 8.2 渲染模块

当前渲染模块为 `lib/email/interview-schedule.tsx`。

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
  scheduleUrl?: string;
  note?: string;
}): Promise<string>;
```

### 8.3 发送方式

不要把面试通知伪装成结果邮件。

可选方案：

- 泛化现有 `email_batch` 和 `email_delivery`，支持 `templateKey = "interview.schedule"`，并去掉结果邮件专属的 `accept` 语义；
- 第一版新增一个独立的面试通知发送 action，只写入必要发送日志。

不要用 `email_batch.accept = false` 来假装面试通知是不通过邮件。

### 8.4 前端预览和配置

面试通知邮件第一版可以先使用固定模板，但后续应接入前端配置能力：

- 在邮件管理页新增“面试预约通知”模板入口；
- 支持预览真实渲染效果；
- 支持编辑标题、正文说明、备注提示和落款等非结构化文案；
- 保留系统变量占位符，例如候选人姓名、流程名称、讲师姓名、开始时间、结束时间和地点；
- 保存模板配置时校验必需变量，避免误删时间或地点信息；
- 支持发送测试邮件到指定南邮邮箱。

该能力不应复用结果邮件的 `accept/rejected` 语义。推荐新增独立的 `interview.schedule` 模板 key，或先扩展 `email_template_setting` 支持更多模板类型。

当前实现已经新增 `email_template_content`，邮件管理页可以编辑和预览 `interview.schedule` 的标题、主标题、正文说明和落款。保存时会校验候选人、流程、讲师、时间和地点等必需变量。讲师在预约弹窗提交前也可以预览本次实际邮件；改约和取消会发送对应状态邮件。

## 9. 前端改动

### 9.1 面评候选人表

修改 `components/recruitment/evaluationTable.tsx`：

- 在候选人行上新增“预约面试”按钮，打开开始时间、结束时间和备注输入；
- 创建成功后在候选人行展示内部留档会议、日程链接和线下面试时间；
- 预约日程结束前，不展示面评操作；
- 预约日程结束后，讲师填写并提交面评；管理员在审批页决定通过或驳回；
- 面评弹窗只保留面评内容输入，妙记链接由飞书事件自动同步后展示；
- 飞书授权状态展示在 dashboard 侧边栏底部，只对讲师及以上可见。

### 9.2 授权入口

当前飞书授权入口：

- 从 Link 网页进入时，跳转到飞书 OAuth 授权；
- 从飞书网页应用进入时，不创建 People session；未登录用户仍通过 SAST Link 登录；
- 绑定完成后回到 dashboard，并显示最新授权状态。

## 10. 路由建议

当前路由：

- `GET /api/auth/feishu`
  - 把飞书 OAuth 绑定到当前 Link session；
  - 要求当前已有 Link session。

`GET /api/auth/feishu` 只用于把飞书 OAuth 绑定到当前 Link session，不用于登录或创建基于本地 `public.user.id` 的 People session。

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

当前已落地：`POST /api/feishu/events` 使用飞书 SDK `EventDispatcher` 处理 URL verification、verification token 和加密事件；会议结束事件用于记录会议结束审计，妙记生成事件 `minutes.minute.generated_v1` 会按事件来源 ID 找到日程，并用事件中的 `minute_token` 调用 `minutes.v1.minute.get` 获取飞书妙记 URL 后写入 `interview_schedule.meeting_minute_link`。

### Phase 4：飞书体验优化

- 飞书工作台入口：打开 People dashboard，不参与登录；
- 飞书消息提醒：授权成功、预约成功、改约、取消、面试前提醒、面评待提交和妙记同步提醒已接入；
- 飞书群通知：配置 `FEISHU_INTERVIEW_CHAT_ID` 后会发送隐私收敛后的群卡片；默认关闭；
- 飞书任务：适合承载“面评待提交”待办，但需要额外开通 Task v2 权限和确定任务清单归属，当前保留为后续可选增强；
- 飞书工作台入口：当前不接入主登录链路，未登录用户仍回到 SAST Link 登录；
- 飞书日程修改和取消：People 内改约或取消时同步飞书日程，已接入；
- 妙记链接回填：飞书 `minutes.minute.generated_v1` 事件驱动的自动回填已接入，面评弹窗不再支持手填；
- 讲师飞书绑定状态展示：dashboard 侧边栏底部已展示是否绑定和 token 过期时间；
- 日程冲突提示：已在创建前检查讲师个人日历忙闲状态；
- 操作失败补偿：飞书创建成功但邮件失败时保留日程记录并提示补发。

## 12. 风险和决策点

### 12.1 候选人是否作为飞书参与人

候选人可能没有飞书账号，也可能不在同一个租户内。People 必须自己发送邮件通知，不能只依赖飞书参与人通知。

### 12.2 token 存储

只存在 session 中不够稳定，因为用户可能从不同浏览器或飞书客户端打开 People。飞书 OAuth token 应按 Link 用户 ID 持久化存储，并加密。

### 12.3 日程组织者语义

如果产品要求日程组织者是讲师本人，必须使用讲师的飞书 `user_access_token`。

如果可以接受 SAST 共享日历作为组织者，可以使用 `tenant_access_token` 和共享日历。这样实现更简单，但组织者语义不同。

### 12.4 当前 legacy 飞书登录

当前 legacy 飞书登录路径不能直接复用。它会基于旧 People 用户创建 session，并且会丢弃飞书 token。该路径应替换为“飞书授权绑定 Link 用户”的逻辑。

## 13. 验收标准

- 讲师从 Link 网页进入时，可以授权飞书并预约面试；
- 飞书网页应用可以打开 People dashboard；当前不通过飞书入口自动创建 People session，未登录时仍回到 SAST Link 登录；
- 使用用户 OAuth 创建日程时，飞书日程组织者是讲师本人；
- People 保存 `calendar_id`、`event_id`、会议链接、开始/结束时间和创建讲师 Link 用户 ID；
- 面试同学收到包含线下面试时间、地点和备注的邮件，不包含会议或日程链接；
- 预约失败时，讲师能看到明确错误，服务端有日志；
- 飞书 token 不会出现在客户端代码、页面数据或日志中。
