# 飞书面试日程接入实现方案

| 项目 | 内容 |
| --- | --- |
| 文档状态 | Implemented（正文已按 2026-10-10 代码核对） |
| 适用范围 | SAST People v3 |
| 最后更新 | 2026-10-10 |
| 相关模块 | Link 登录、飞书 OAuth、面评、面试日程、邮件发送 |

> 说明：本文保留原方案的目标与取舍叙事。凡涉及「当前实现」的描述，均已按仓库代码核对；未落地的增强项在 §11 单独列出。

## 1. 目标

People 的面试流程需要支持两种形态：

- **技术类流程**（`recruitment_exemption`、`woc`、`soc`）：讲师在 People 中预约面试，People 为该讲师创建内部飞书日程和留档会议；
- **办公类部门面试**（`office_interview`）：**不产生飞书会议**。候选人在报名时按 `flow.slot_options` 选择一个集中面谈时段，写入 `user_flow.interview_slot`；部长在面试管理页直接调整该时段，面评提交即留档（无飞书日程、无视频会议、无妙记）。

两类流程共同的目标：

- People 保存飞书日程 ID、日程链接、会议链接和面试时间（仅技术类）；
- 面试同学收到邮件，邮件中展示线下面试时间、地点、流程信息和讲师信息，不展示飞书会议或日程链接；
- 飞书应用事件可回写日程状态、妙记链接与候选人改期（仅技术类）。

该功能需要支持两种打开入口，但登录入口只有一种：

- 用户从网页通过 SAST Link 进入 People；
- 用户从飞书网页应用打开 People dashboard，未登录时仍跳转到 SAST Link 登录。

流程类型共 5 种：`recruitment`、`recruitment_exemption`、`woc`、`soc`、`office_interview`（`const/flow.ts`、`db/schema.ts`）。其中 `office_interview` 为「每个办公部门一条独立流程」（迁移 `0062`、`0064`、`0066`）。

## 2. 核心原则

People 的业务身份必须统一使用 SAST Link 用户 ID，登录流程必须全部走 SAST Link。

飞书身份不是新的 People 用户身份，而是绑定在 Link 用户上的一种 OAuth 能力。飞书网页应用只负责打开 People，不负责创建 People session。

不要在这个功能里继续把旧 `public.user.id` 当作 session `uid` 使用。
不要实现飞书免登或通过飞书身份自动创建 People session。

## 2.1 当前实现状态

截至 2026-10-10，当前代码已经落地：

- 讲师飞书 OAuth 绑定，token 加密后持久化到 `user_oauth_account`（`lib/feishu/oauth-account.ts` 的 `upsertFeishuOAuthAccount`，token 经 `encryptSecret`/`decryptSecret` 处理）；
- 登录流程统一走 SAST Link；
- 飞书授权状态与绑定入口唯一出现在「安排线下面试」弹窗内（`components/recruitment/evaluationTable.tsx`，`FeishuOAuthStatus` 由 `components/feishu-oauth-status.tsx` 提供）；侧边栏（`components/app-sidebar.tsx`）已无该控件；
- 预约时使用讲师个人 `user_access_token` 在**共享日历**创建飞书日程和留档会议（`createFeishuInterviewSchedule`，`lib/feishu/interview-schedule.ts`）；
- 创建前调用飞书 Calendar v4 `freebusy.list` 检查讲师个人日历忙闲状态，并带 `include_external_calendar: true`（`lib/feishu/interview-schedule.ts` 的 `assertOrganizerIsAvailable`）；
- 支持预约会议室，并在会议室被占用（`rsvp_status` 为 `decline`/`removed`）时阻断预约（`lib/interview-meeting-rooms.ts`、`lib/feishu/interview-schedule.ts` 的 `addFeishuCalendarMeetingRoom`）；
- 创建日程后写入 `interview_schedule`，保存飞书日程 ID、会议唯一 ID、会议链接和日程链接；
- 面试通知邮件使用独立模板（`interview.schedule.created` / `rescheduled` / `cancelled` / `change.rejected`，见 §8），支持邮件管理页编辑、预约前预览、改约/取消状态展示；候选人邮件只表达线下到场安排；
- 非生产环境邮件会重定向到 `EMAIL_TEST_RECIPIENT`，默认 `b24150524@njupt.edu.cn`；
- 飞书授权成功、预约成功、改约、取消、面试前提醒、面评待提交、面评退回和妙记同步后，会通过飞书 IM 给讲师发送机器人卡片提醒（`lib/feishu/interview-message.ts`），提醒失败不影响主流程；
- 审批群卡片与退回提醒由 `lib/feishu/approval-notification.ts` 与 `lib/feishu/interview-message.ts` 提供；群聊 ID 由 `FEISHU_APPROVAL_CHAT_ID` 配置；
- 如果配置 `FEISHU_INTERVIEW_CHAT_ID`，预约、改约和取消会同步发送隐私收敛后的群卡片，不包含手机号和备注；
- People 内改约会同步更新飞书会议预约和飞书日程，并重发候选人邮件；取消会同步删除飞书日程与会议预约，并把本地日程标记为 `cancelled`；
- 取消失败会写入 `interview_schedule_cancellation_outbox` 并由定时任务重试（`lib/interview-schedule-cancellation-outbox.ts`、`queue/interviewScheduleCancellationOutbox.ts`，迁移 `0048`）；
- 妙记由飞书自动生成，People 通过飞书 `minutes.minute.generated_v1` 事件回调回填日程和对应面评档案，不要求讲师手动填写；
- 飞书事件回调 `/api/feishu/events` 已接入会议结束事件、妙记生成事件和日历事件变更（`calendar.calendar.event.changed_v4`）。日历事件变更会经 `syncInterviewScheduleFromFeishuEvent` 回写 People（`lib/feishu/interview-schedule-sync.ts`）；
- 候选人可发起改期申请（**技术类流程专属**，`action/user-flow/interview-slot-change.ts`），由部长及以上审批；办公类改期审批已下线（迁移 `0067`），改为部长在面试管理页直接改 `user_flow.interview_slot`；
- 办公类：候选人在报名时按 `flow.slot_options` 选时段写入 `user_flow.interview_slot`（`db/schema.ts`）；部长可在面试管理页行内直接改时段（`action/user-flow/interview-slot.ts` 的 `updateCandidateInterviewSlot`、`components/recruitment/evaluationTable.tsx`），面评提交即留档、不进审批列表（`action/user-flow/evaluation.ts` 的 `createEvaluation`）；
- 数据权限：技术类面试日程相关 action 均以 `assertUserFlowInScope` 做部门 scope 校验（`lib/flow-access.ts`）；
- 面评 UI 按「先预约线下面试、确认结束后由讲师提交面评与建议、管理员终审」的流程展示；讲师可在事件回调缺失时手动确认已结束。面评正文为必填项，讲师建议通过和建议不通过都会留档；管理员归档页仅保留有完整面评的管理员决策，并支持筛选检索。归档后的最终决定不可撤销或改判。通过后的权限调整走成员管理，不通过后须重新报名并完整走流程。

仍需外部配合：

- 正式 Link OAuth/API 未就绪时，线上不能作为正式可用登录链路，只能使用本地 mock（`LINK_USE_MOCK`、`LINK_LOGIN_FEISHU_TEST_MOCK`）做飞书和流程联调。

以上依赖需要继续对接 Link 和飞书开放平台配置。

## 3. 当前代码现状

已有基础：

- `lib/feishu/user-auth.ts` 使用飞书 Node SDK 交换和刷新用户 access token（`exchangeFeishuOAuthCode`、`refreshFeishuUserAccessToken`）；
- `lib/feishu/oauth-account.ts` 已按 Link 用户 ID 持久化飞书 OAuth token（`getFeishuOAuthAccountStatus`、`upsertFeishuOAuthAccount`、`getValidFeishuUserCredential`、`getValidFeishuUserAccessToken`）；
- `interview_evaluation.meeting_link` 当前保留为面试结束后的妙记链接字段（`db/schema.ts`）；
- `components/recruitment/evaluationTable.tsx` 已有面评内容输入，并展示飞书事件自动同步的妙记链接；
- 邮件系统已有模板渲染和发送记录能力（`emails/interview-schedule.tsx`、`lib/email/interview-schedule.tsx`）。

当前缺口：

- 真实 Link lark identity 未就绪时，需要使用本地测试开关（`LINK_LOGIN_FEISHU_TEST_MOCK`）绕过 union_id 匹配做飞书功能联调。

## 4. 身份和授权模型

### 4.0 飞书开发者平台配置

当前实现依赖同一个飞书自建应用，需要在开发者平台完成：

- 配置 `APP_ID`、`APP_SECRET`；
- OAuth 重定向地址（`FEISHU_OAUTH_REDIRECT_URI`）精确加入白名单，例如本地开发为 `http://localhost:3000/api/auth/feishu`，线上为 `https://people.sast.fun/api/auth/feishu`；
- 网页应用能力的桌面端主页和移动端主页配置为 People dashboard，例如 `https://people.sast.fun/dashboard`；
- 开通日历权限，用于创建日程、添加参与人、查询忙闲；
- 开通视频会议预约权限，用于创建飞书会议；
- 开启机器人能力，并开通发送消息权限，用于向讲师发送预约提醒；
- 配置事件订阅回调地址，例如 `https://<people-host>/api/feishu/events`；
- 订阅项目应用可用的会议结束事件和 `minutes.minute.generated_v1`；发布前需用飞书事件调试确认实际 event key 与 payload 字段，并覆盖 `vc.meeting.participant_meeting_ended_v1` 兼容路径；
- 配置 `FEISHU_EVENT_VERIFICATION_TOKEN` 和可选的 `FEISHU_EVENT_ENCRYPT_KEY`；
- 配置 `PEOPLE_PUBLIC_BASE_URL`，用于飞书卡片中的 People 直达按钮；
- 可选配置 `FEISHU_INTERVIEW_CHAT_ID`（日程概览群）、`FEISHU_APPROVAL_CHAT_ID`（审批群）、`FEISHU_FEEDBACK_CHAT_ID`（反馈群，用于 About 页反馈通知）；
- 配置共享日历 ID `FEISHU_INTERVIEW_CALENDAR_ID`（新建日程使用的共享日历）；
- 发布或安装应用到目标组织，使讲师对该机器人具备可用性。

如果日历忙闲查询权限未配置，People 会记录错误但不阻断预约；如果查询结果确认讲师该时间段已有忙碌日程，则阻断预约。

相关环境变量以 `.env.example` 为准。

### 4.1 从 Link 网页进入

1. 用户通过 SAST Link 登录 People。
2. People session 中保存 `uid = Link user id`。
3. 如果用户身份为讲师及以上（role ≥ 2），可在面试管理页的「安排线下面试」弹窗内查看飞书授权状态并完成绑定。
4. 授权完成后，把飞书 `open_id`、`union_id`、`access_token`、`refresh_token` 和过期时间绑定到当前 Link 用户 ID（`app/api/auth/feishu/route.ts`）。

### 4.2 从飞书网页应用打开

1. 飞书网页应用打开 People dashboard。
2. 如果当前浏览器已有 People session，直接进入 dashboard。
3. 如果没有 People session，People 跳转到 `/login`。
4. 用户必须通过 SAST Link 登录。
5. 登录成功后，讲师及以上可在「安排线下面试」弹窗内绑定飞书授权。

### 4.3 为什么讲师个人发起必须走用户 OAuth

如果产品要求飞书日程的组织者就是讲师本人，People 创建日程时必须使用该讲师的飞书 `user_access_token`。

使用 `tenant_access_token` 可以创建应用身份或共享日历身份的日程，但不能让讲师个人成为日程组织者。

## 5. 数据模型

### 5.1 `user_oauth_account`

用于保存 Link 用户的第三方 OAuth 绑定（`db/schema.ts`）。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | serial | 主键 |
| `fk_user_id` | integer | Link 用户 ID |
| `provider` | varchar(32) | 当前为 `feishu` |
| `provider_user_id` | varchar(255) | 飞书 `open_id` |
| `provider_union_id` | varchar(255) nullable | 飞书 `union_id` |
| `access_token` | text | 加密后的飞书 access token |
| `refresh_token` | text nullable | 加密后的飞书 refresh token |
| `access_token_expires_at` | timestamptz nullable | access token 过期时间 |
| `refresh_token_expires_at` | timestamptz nullable | refresh token 过期时间 |
| `created_at` | timestamptz | 默认当前时间 |
| `updated_at` | timestamptz | 默认当前时间 |

约束：

- `unique(fk_user_id, provider)`；
- `unique(provider, provider_user_id)`。

安全要求：

- token 字段必须加密存储（`lib/secret.ts` 的 `encryptSecret`/`decryptSecret`）；
- 日志中禁止输出 token；
- token 不允许传给客户端组件。

### 5.2 `interview_schedule`

用于保存飞书日程和会议元数据（`db/schema.ts`）。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | serial | 主键 |
| `fk_user_flow_id` | integer | 关联 `user_flow.id` |
| `fk_evaluation_id` | integer nullable | 关联 `interview_evaluation.id` |
| `fk_organizer_id` | integer | 创建讲师的 Link 用户 ID |
| `provider` | varchar(32) | 当前为 `feishu` |
| `provider_calendar_id` | varchar(255) | 飞书 calendar ID |
| `provider_event_id` | varchar(255) nullable | 飞书 event ID |
| `provider_reserve_id` | varchar(255) nullable | 飞书会议预约 ID |
| `provider_meeting_no` | varchar(255) nullable | 飞书会议号 |
| `provider_meeting_id` | varchar(255) nullable | 飞书会议唯一 ID，用于关联会议结束和妙记事件 |
| `meeting_link` | text | 飞书会议链接 |
| `schedule_link` | text nullable | 飞书日程详情链接 |
| `meeting_minute_link` | text nullable | 飞书妙记链接 |
| `summary` | varchar(255) | 日程标题 |
| `description` | text nullable | 日程描述 |
| `location` | varchar(255) nullable | 地点 |
| `meeting_room_id` | varchar(255) nullable | 会议室 ID |
| `attendee_email` | varchar(254) nullable | 参会邮箱 |
| `starts_at` | timestamptz | 面试开始时间 |
| `ends_at` | timestamptz | 面试结束时间 |
| `timezone` | varchar(64) | 默认 `Asia/Shanghai` |
| `status` | enum | `created`、`cancelled`、`failed` |
| `meeting_status` | varchar(32) | `scheduled`、`ended` |
| `meeting_ended_at` | timestamptz nullable | 飞书会议实际结束时间或讲师手动确认时间 |
| `created_at` | timestamptz | 默认当前时间 |
| `updated_at` | timestamptz | 默认当前时间 |

约束：

- 部分唯一索引 `unique(fk_user_flow_id) where status = 'created'`（同一报名同一时间只允许一个 active schedule）；
- 唯一索引 `unique(provider, provider_event_id)`；
- 为 `fk_user_flow_id`、`fk_organizer_id` 建普通索引。

### 5.3 与 `interview_evaluation.meeting_link` 的边界

`interview_evaluation.meeting_link` 保留为面试结束后的妙记链接或复盘记录链接（`db/schema.ts`）。

创建日程后只写入：

- `interview_schedule.meeting_link`；
- `interview_schedule.schedule_link`。

不要把飞书会议链接自动写入 `interview_evaluation.meeting_link`。`interview_evaluation.meeting_link` 只保留面试结束后的妙记链接或复盘记录链接；当前妙记优先由飞书事件自动同步。

### 5.4 `interview_schedule_cancellation_outbox`

取消飞书日程失败时的重试队列（迁移 `0048`，`db/schema.ts`）。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | serial | 主键 |
| `fk_interview_schedule_id` | integer | 关联 `interview_schedule.id`，唯一 |
| `attempt_count` | integer | 已尝试次数 |
| `next_attempt_at` | timestamptz | 下次尝试时间 |
| `locked_until` | timestamptz nullable | 锁定截止时间 |
| `last_attempt_at` | timestamptz nullable | 上次尝试时间 |
| `last_error` | text nullable | 上次错误 |
| `published_at` | timestamptz nullable | 完成时间（NULL = 待处理） |
| `created_at` / `updated_at` | timestamptz | 时间戳 |

### 5.5 `interview_slot_change_request`

候选人改期申请（迁移 `0063`、`0065`、`0067`，`db/schema.ts`）。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | serial | 主键 |
| `fk_user_flow_id` | integer | 关联 `user_flow.id` |
| `requested_slot` | varchar(100) nullable | 办公类按时段申请时使用（办公类改期审批已下线） |
| `requested_starts_at` | timestamptz nullable | 技术类希望改到的新开始时间 |
| `requested_ends_at` | timestamptz nullable | 技术类希望改到的新结束时间 |
| `fk_interview_schedule_id` | integer nullable | 关联 `interview_schedule.id`（技术类） |
| `reason` | text | 申请理由（必填） |
| `status` | varchar(16) | `pending` / `approved` / `rejected` |
| `fk_requested_by` | integer | 申请人 Link 用户 ID |
| `fk_reviewed_by` | integer nullable | 审批人 Link 用户 ID |
| `review_note` | text nullable | 审批备注 |
| `reviewed_at` | timestamptz nullable | 审批时间 |
| `created_at` / `updated_at` | timestamptz | 时间戳 |

约束：部分唯一索引 `unique(fk_user_flow_id) where status = 'pending'`。

## 6. 后端模块

### 6.1 飞书 token 读取模块

当前实现位于 `lib/feishu/oauth-account.ts`。

职责：

- 根据 Link 用户 ID 读取飞书 OAuth 绑定；
- token 即将过期时刷新（提前 5 分钟）；
- 返回可用的 `user_access_token`；
- 刷新成功后更新持久化 token；
- 授权缺失或已过期且无法刷新时抛出明确错误。

导出：

```ts
export type FeishuOAuthAccountStatus = {
  bound: boolean;
  providerUserId?: string;
  providerUnionId?: string | null;
  authorizationExpiresAt?: Date | null;
};

export async function getFeishuOAuthAccountStatus(linkUserId: number): Promise<FeishuOAuthAccountStatus>;

export async function getValidFeishuUserAccessToken(linkUserId: number): Promise<string>;

export async function getValidFeishuUserCredential(linkUserId: number): Promise<{
  accessToken: string;
  openId: string;
  unionId: string | null;
}>;
```

### 6.2 飞书 OAuth 绑定模块

当前实现位于 `action/user/feishuOAuth.ts`、`app/api/auth/feishu/route.ts` 和 `lib/feishu/user-auth.ts`。

职责：

- 用 auth code 换飞书用户 token（`exchangeFeishuOAuthCode`）；
- 获取飞书用户身份；
- 把飞书身份绑定到当前 Link 用户（`upsertFeishuOAuthAccount`）；
- 绑定前校验飞书身份与当前 Link 账号的 lark identity 一致（`assertFeishuUnionMatchesLinkIdentity`，本地可用 `LINK_LOGIN_FEISHU_TEST_MOCK` 跳过）。

导出：

```ts
// action/user/feishuOAuth.ts
export async function redirectFeishuOAuth(returnTo?: string): Promise<void>;
export async function getCurrentFeishuOAuthStatus(): Promise<...>;

// lib/feishu/user-auth.ts
export async function exchangeFeishuOAuthCode(code: string): Promise<FeishuUserToken>;
export async function refreshFeishuUserAccessToken(refreshToken: string): Promise<FeishuUserToken>;
```

### 6.3 飞书日历模块

当前实现位于 `lib/feishu/interview-schedule.ts`。

职责（均已实现）：

- 创建飞书日程并在日程中创建飞书会议（`createFeishuInterviewSchedule`）；
- 添加参与人（讲师自动接受、会议室预约）；
- 修改日程（`updateFeishuInterviewSchedule`）；
- 取消日程（`cancelFeishuInterviewSchedule`）。

导出：

```ts
export const FEISHU_PRIMARY_CALENDAR_ID = "primary";
export function getFeishuInterviewCalendarId(): string;

export async function createFeishuInterviewSchedule(input: CreateFeishuInterviewScheduleInput): Promise<CreatedFeishuInterviewSchedule>;
export async function updateFeishuInterviewSchedule(input: UpdateFeishuInterviewScheduleInput): Promise<...>;
export async function cancelFeishuInterviewSchedule(input: CancelFeishuInterviewScheduleInput): Promise<...>;
export async function getFeishuCalendarEvent(...): Promise<...>;
export async function subscribeFeishuCalendarEventChanges(...): Promise<...>;
export async function getFeishuMinuteInfo(...): Promise<...>;
export async function getFeishuOpenIdByMobile(mobile: string): Promise<string | null>;
export function isFeishuEventNotFoundError(error: unknown): boolean;
export function isFeishuInternalServiceError(error: unknown): boolean;
```

实现要点：

- 新建日程默认使用**共享日历**（`getFeishuInterviewCalendarId()` 读取 `FEISHU_INTERVIEW_CALENDAR_ID`，缺省回落到内置共享日历）；`provider_calendar_id` 保存每条日程实际使用的日历 ID，迁移前的历史记录默认为 `primary`；
- 使用飞书 Calendar v4 `calendarEvent.create` 创建「科协内部活动」共享日历日程，并从日程 `vchat` 取得留档会议链接；候选人不是飞书日程参与人；
- 飞书 VC v1 `reserve.apply` 在当前租户可能返回不支持时，不作为唯一会议创建路径；改约时同步 `vc.reserve.update`，取消时同步 `vc.reserve.delete`；
- 使用 Calendar v4 `freebusy.list` 在创建前检查**讲师个人日历**忙闲状态，查询带 `include_external_calendar: true`、`only_busy: true`；共享日历只承载 People 创建的面试日程；
- 创建讲师会作为共享日历日程参与人自动接受，确保讲师个人日历同步已接受的日程而无需手动确认；候选人可能没有组织内飞书账号，因此候选人通知以 People 邮件为准；
- 日程参与人可以互相查看，但不能编辑日程；对应 Calendar v4 的 `attendee_ability: can_see_others`。

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

### 6.4 会议室模块

当前实现位于 `lib/interview-meeting-rooms.ts`：

```ts
export const interviewMeetingRooms = [
  { id: "omm_f2b7a9f9ba5afa0b96906cf2cb4f1a06", name: "大学生活动中心-汇客厅(112 - 113)" },
  { id: "omm_17a653591966274e91219f66043e1218", name: "大学生活动中心-101 中区" },
] as const;

export function getInterviewMeetingRoom(id?: string | null): (typeof interviewMeetingRooms)[number] | undefined;
```

`lib/feishu/interview-schedule.ts` 的 `addFeishuCalendarMeetingRoom` 会把会议室作为 `resource` 参与人加入日程；当返回的 `rsvp_status` 为 `decline` 或 `removed` 时抛出「会议室已被占用」，阻断预约。改约时通过 `removeFeishuCalendarMeetingRoom` 释放旧会议室。

### 6.5 飞书日程变更回写

`app/api/feishu/events/route.ts` 注册 `calendar.calendar.event.changed_v4` 事件，路由到 `syncInterviewScheduleFromFeishuEvent`（`lib/feishu/interview-schedule-sync.ts`）。

`syncInterviewScheduleFromFeishuEvent` 按 `provider_event_id` 找到 `status = 'created'` 的日程，用讲师的 `user_access_token` 拉取最新日程并回写时间、地点、会议室、会议链接等字段到 `interview_schedule`，同时按需重发/发送候选人邮件并写入 operation audit。

### 6.6 取消失败的 outbox 重试

取消飞书日程/会议失败时，日程会留下待处理的 outbox 记录（`db/schema.ts` 的 `interviewScheduleCancellationOutbox`）。

- `lib/interview-schedule-cancellation-outbox.ts` 的 `dispatchInterviewScheduleCancellationOutbox` 领取待处理行（带 `locked_until` 锁）并重试取消；
- `queue/interviewScheduleCancellationOutbox.ts` 的 `interviewScheduleCancellationOutboxDispatcher` 以每分钟 cron 触发该分发函数（Inngest）。

### 6.7 候选人改期申请（技术类专属）

当前实现位于 `action/user-flow/interview-slot-change.ts`：

```ts
export type RequestInterviewSlotChangeInput = {
  userFlowId: number;
  requestedStartsAt?: string;
  reason: string;
};

export const requestInterviewSlotChange = async (...): Promise<ActionResult>;
export const reviewInterviewSlotChange = async (...): Promise<ReviewSlotChangeResult>;
export const listPendingSlotChangeRequests = async (...): Promise<PendingSlotChangeRow[]>;
```

- `requestInterviewSlotChange` 通过 `isTechInterviewFlow` 限定技术类流程；办公类返回「该流程不支持修改面试时间」（办公类时段由部长直接改，见 §9）；
- 同一报名只保留一条 `pending` 申请（迁移 `0063`/`0065` 的唯一索引）；
- 审批通过后同步飞书日程并重发邮件；退回会发送 `interview.schedule.change.rejected` 邮件。

### 6.8 部门 scope 校验

`action/user-flow/interviewSchedule.ts` 在预约、取消、退回、确认结束等入口调用 `assertUserFlowInScope(session.scope, ...)`（导入自 `lib/flow-access.ts`）做部门数据权限校验；scope 由 `lib/authz.ts` 的 `getDepartmentScope` 提供。

### 6.9 审批群卡片与退回提醒

`lib/feishu/approval-notification.ts`：

```ts
export async function loadFeishuApprovalNotificationRecord(evaluationId: number): Promise<...>;
export function buildFeishuApprovalCard(context: FeishuApprovalNotificationContext): ...;
export async function sendFeishuApprovalCard(...): Promise<...>;
export function buildFeishuApprovalReminderCard(...): ...;
```

`lib/feishu/interview-message.ts` 提供讲师侧卡片：`sendInterviewScheduleCard`、`sendInterviewCancelledCard`、`sendInterviewSlotChangeRequestCard`、`sendInterviewMinuteCard`、`sendFeishuOAuthBoundCard`、`sendInterviewEvaluationReturnedCard`。面评退回会发送「面评已退回，请重新填写」提醒。

### 6.10 面试邮件模板（4 个状态键 + 部门覆盖）

当前实现位于 `lib/email/interview-template-settings.ts`：

```ts
export const interviewScheduleTemplateKeys = {
  created: "interview.schedule.created",
  rescheduled: "interview.schedule.rescheduled",
  cancelled: "interview.schedule.cancelled",
  changeRejected: "interview.schedule.change.rejected",
} as const;

export const INTERVIEW_WITHDRAWAL_TEMPLATE_KEY = "interview.application.withdrawn";

export async function getInterviewNotificationTemplateSetting(templateKey, department?): Promise<InterviewScheduleTemplateResolvedSetting>;
export async function getInterviewScheduleTemplateSetting(kind?, department?): Promise<...>;
export async function listInterviewScheduleTemplateSettings(department?, scope?): Promise<...>;
export async function upsertInterviewScheduleTemplateSetting(templateKey, values, department): Promise<...>;
export async function deleteInterviewScheduleTemplateSetting(templateKey, department): Promise<boolean>;
```

- 模板按「模板键 + 部门」存储，`department` 为 NULL 表示全局默认行（迁移 `0061`）；解析顺序为「内置默认 → legacy 回退 → 命中的部门覆盖行」；
- 模板行存放于 `email_template_setting` / `email_template_content`，文案字段由迁移 `0056` 扩展。

## 7. People Server Actions

### 7.1 预约面试

当前实现在 `action/user-flow/interviewSchedule.ts`：

```ts
export async function createInterviewSchedule(params: {
  userFlowId: number;
  startsAt: Date;
  endsAt: Date;
  // ...
}): Promise<...>;

export async function previewInterviewScheduleEmail(...): Promise<...>;
export async function cancelInterviewSchedule(...): Promise<...>;
export async function returnInterviewCandidate(...): Promise<...>;
export async function confirmInterviewScheduleEnded(...): Promise<...>;
```

流程：

1. `verifyScopedRole(2)`；
2. 读取 `user_flow`、`flow` 和候选人 Link 用户信息；
3. 校验流程类型不能是笔试流程（`recruitment`），且报名处于 `ongoing`；办公类流程在 UI 上不提供该入口，走时段报名（§9.1）；
4. 根据当前讲师 Link 用户 ID 获取飞书 `user_access_token`（`getValidFeishuUserCredential`）；
5. 检查讲师个人日历忙闲；
6. 创建飞书日程和会议，并按需预约会议室；
7. 写入或更新 `interview_schedule`；
8. 发送面试通知邮件；
9. 写入 operation audit；
10. revalidate 招新页。

预约面试不创建或更新面评记录。面评必须在预约日程结束后由讲师单独提交。

### 7.2 办公类时段调整

`action/user-flow/interview-slot.ts` 的 `updateCandidateInterviewSlot(userFlowId, slot)`：

- 要求 `verifyManager` 且 `assertUserFlowInScope`；
- 仅允许办公类流程（`isOfficeInterviewFlow`）；
- 已通过/未通过/已退回的报名拒绝调整；
- 直接把时段写入 `user_flow.interview_slot`。

### 7.3 授权缺失处理

授权缺失或过期无法刷新时，`getValidFeishuUserCredential` 抛出明确错误（如「请先绑定飞书账号后再发起面试日程。」）；「安排线下面试」弹窗内展示 `FeishuOAuthStatus` 的「绑定飞书」入口，避免只展示泛化的「操作失败」。

## 8. 邮件

### 8.1 面试通知模板

模板组件位于 `emails/interview-schedule.tsx`（`InterviewScheduleEmail`）。模板文案由 `lib/email/interview-template-settings.ts` 管理，支持 4 个状态键（见 §6.10）。

模板变量（`interviewScheduleTemplateVariables`）：

- 候选人姓名；
- 流程名称；
- 讲师姓名；
- 面试开始时间；
- 面试结束时间；
- 时区；
- 可选备注；
- 联系邮箱。

### 8.2 渲染模块

当前渲染模块为 `lib/email/interview-schedule.tsx`：

```ts
export async function renderInterviewScheduleEmail(...): Promise<string>;
export async function renderInterviewScheduleEmailSubject(...): Promise<string>;
export async function renderInterviewScheduleEmailPreview(...): Promise<...>;
```

### 8.3 发送方式

不要把面试通知伪装成结果邮件。

- 复用 `email_batch`/`email_delivery` 发送，模板键为 `interview.schedule.created` / `rescheduled` / `cancelled` / `change.rejected`；
- 不要用 `email_batch.accept = false` 来假装面试通知是不通过邮件。

### 8.4 前端预览和配置

- 邮件管理页支持编辑和预览 4 个状态键的标题、副标题、正文说明和落款（`lib/email/interview-template-settings.ts` 的 `upsertInterviewScheduleTemplateSetting`）；
- 保存时校验候选人、流程、讲师、时间和地点等必需变量；
- 讲师在预约弹窗提交前也可以预览本次实际邮件（`previewInterviewScheduleEmail`）；
- 支持发送测试邮件到指定南邮邮箱。

## 9. 前端改动

### 9.1 面评候选人表

`components/recruitment/evaluationTable.tsx`：

- **技术类**：候选人行上有「预约面试」/「安排线下面试」入口，打开开始时间、结束时间和备注输入；创建成功后在候选人行展示内部留档会议、日程链接和线下面试时间；预约日程结束前不展示面评操作；结束后讲师填写并提交面评，管理员在审批页决定通过或驳回；
- **办公类**：候选人行展示的是候选人报名时选择的集中面谈时段；部长（role ≥ 3）可在行内直接改时段（下拉选择，`slotEditable`），保存调用 `updateCandidateInterviewSlot`，不走改期审批；面评弹窗只保留面评内容输入；
- 妙记链接由飞书事件自动同步后展示，不支持手填；
- 飞书授权状态（`FeishuOAuthStatus`）只出现在「安排线下面试」弹窗内，不再放在侧边栏。

### 9.2 授权入口

当前飞书授权入口：

- 从 Link 网页进入时，在「安排线下面试」弹窗内跳转到飞书 OAuth 授权；
- 从飞书网页应用进入时，不创建 People session；未登录用户仍通过 SAST Link 登录；
- 绑定完成后回到 dashboard，并显示最新授权状态。

## 10. 路由建议

当前路由：

- `GET /api/auth/feishu`：把飞书 OAuth 绑定到当前 Link session，要求当前已有 Link session。
- `POST /api/feishu/events`：飞书事件回调（会议结束、妙记生成、日历事件变更）。

`GET /api/auth/feishu` 只用于把飞书 OAuth 绑定到当前 Link session，不用于登录或创建基于本地 `public.user.id` 的 People session。

## 11. 落地阶段

### Phase 1：绑定和预约 MVP（已实现）

- 新增 OAuth 绑定表 `user_oauth_account`；
- 新增飞书 token 读取和刷新 helper（`lib/feishu/oauth-account.ts`）；
- 新增飞书日程创建 helper（`createFeishuInterviewSchedule`）；
- 新增面试日程表 `interview_schedule`；
- 新增预约面试 action（`createInterviewSchedule`）；
- 新增面试通知邮件模板；
- 更新非笔试面评 UI。

### Phase 2：改期和取消（已实现）

- 支持修改面试时间、更新飞书日程、重发通知邮件（`updateFeishuInterviewSchedule`）；
- 支持取消日程和审计记录（`cancelFeishuInterviewSchedule`）；
- 改约会同步 `vc.reserve.update` 和 `calendarEvent.patch`，取消会同步 `calendarEvent.delete` 和 `vc.reserve.delete`。

### Phase 3：飞书应用事件（已实现）

- `POST /api/feishu/events` 使用飞书 SDK `EventDispatcher` 处理 URL verification、verification token 和加密事件；
- 会议结束事件用于记录会议结束审计；
- 妙记生成事件 `minutes.minute.generated_v1` 会按事件来源 ID 找到日程，并用事件中的 `minute_token` 调用 `minutes.v1.minute.get` 获取飞书妙记 URL 后写入 `interview_schedule.meeting_minute_link`；
- 日历事件变更 `calendar.calendar.event.changed_v4` 会经 `syncInterviewScheduleFromFeishuEvent` 回写 People。

### Phase 4：飞书体验优化

已实现：

- 飞书消息提醒：授权成功、预约成功、改约、取消、面试前提醒、面评待提交、面评退回和妙记同步提醒；
- 飞书群通知：配置 `FEISHU_INTERVIEW_CHAT_ID` 后发送隐私收敛后的群卡片；审批群卡片走 `FEISHU_APPROVAL_CHAT_ID`；
- 飞书日程修改和取消：People 内改约或取消时同步飞书日程；
- 妙记链接回填：`minutes.minute.generated_v1` 事件驱动的自动回填；
- 讲师飞书绑定状态展示：在「安排线下面试」弹窗内展示是否绑定和 token 过期时间；
- 日程冲突提示：创建前检查讲师个人日历忙闲状态；
- 会议室预约与占用阻断；
- 候选人改期申请（技术类专属）及审批；
- 取消失败的 outbox 重试；
- 操作失败补偿：飞书创建成功但邮件失败时保留日程记录并提示补发；
- 办公类不产生飞书日程/会议：候选人按时段报名，部长在面试管理页直接改 `user_flow.interview_slot`，面评提交即留档。

未实现（保留为后续可选增强）：

- 飞书任务（Task v2）：适合承载「面评待提交」待办，但需要额外开通 Task v2 权限并确定任务清单归属；
- 飞书工作台入口：当前不接入主登录链路，未登录用户仍回到 SAST Link 登录。

## 12. 风险和决策点

### 12.1 候选人是否作为飞书参与人

候选人可能没有飞书账号，也可能不在同一个租户内。People 必须自己发送邮件通知，不能只依赖飞书参与人通知。

### 12.2 token 存储

只存在 session 中不够稳定，因为用户可能从不同浏览器或飞书客户端打开 People。飞书 OAuth token 应按 Link 用户 ID 持久化存储，并加密。

### 12.3 日程组织者语义

如果产品要求日程组织者是讲师本人，必须使用讲师的飞书 `user_access_token`。

如果可以接受 SAST 共享日历作为组织者，可以使用 `tenant_access_token` 和共享日历。这样实现更简单，但组织者语义不同。

当前实现采用「共享日历承载日程 + 讲师作为参与人」的方式，新建日程使用 `FEISHU_INTERVIEW_CALENDAR_ID` 指定的共享日历。

### 12.4 当前 legacy 飞书登录

当前 legacy 飞书登录路径不能直接复用。它会基于旧 People 用户创建 session，并且会丢弃飞书 token。该路径应替换为「飞书授权绑定 Link 用户」的逻辑。

## 13. 验收标准

- 讲师从 Link 网页进入时，可以授权飞书并预约面试；
- 飞书网页应用可以打开 People dashboard；当前不通过飞书入口自动创建 People session，未登录时仍回到 SAST Link 登录；
- 使用用户 OAuth 创建日程时，飞书日程组织者是讲师本人；
- People 保存 `provider_calendar_id`、`provider_event_id`、会议链接、开始/结束时间和创建讲师 Link 用户 ID；
- 面试同学收到包含线下面试时间、地点和备注的邮件，不包含会议或日程链接；
- 办公类部门面试不产生飞书会议：候选人按时段报名，部长可直接改 `user_flow.interview_slot`，面评提交即留档；
- 预约失败时，讲师能看到明确错误，服务端有日志；
- 飞书 token 不会出现在客户端代码、页面数据或日志中。
