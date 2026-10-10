# SAST People Next

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

南京邮电大学大学生科学技术协会（NJUPT SAST）的招新与评审平台，覆盖**招新流程、笔试评卷、面试评审、面试排期与结果通知**。

SAST People 负责招新与评审流程；用户身份、资料、角色与账号状态由 **SAST Link** 提供。

## 职责边界

| 领域 | 归属 | 说明 |
| --- | --- | --- |
| 用户身份与资料 | SAST Link | OAuth 登录、资料字段、角色、账号状态、第三方身份 |
| 招新流程 | SAST People | 笔试招新、免试招新、WOC/WOD、SOC/SOD（按部门语义化命名） |
| 评审与打分 | SAST People | 扫码评卷、分数汇总、面试评审、最终审批 |
| 面试排期 | SAST People + 飞书 | 日程事件、视频会议、机器人卡片、提醒 |
| 结果通知 | SAST People | 邮件中心模板、批次、重试、限流、投递审计 |
| 管理操作 | SAST People | 用户查询、角色修改、封禁、操作审计、错误日志 |
| 部门数据权限 | SAST People + SAST Link | 部门来自 Link 资料；流程、报名、评卷、评审、邮件与审计按归属部门隔离，全站范围仅对 Link `admin` 账号开放 |
| 可观测性 | SAST People | Sentry、健康检查、服务端错误日志 |

## 核心功能

- 固定流程模型：笔试招新、免试招新、成员考核（WOC/WOD）、讲师考核（SOC/SOD），并按归属部门展示（软件研发部WOC / 多媒体部WOD …）。
- 候选人主动发起面试改期申请（理由必填）：办公类由部长审批，技术类由预约讲师审批，并同步飞书日程/视频会议与通知邮件。
- 办公类部门面试按**每个部门一条独立流程**运行（仅部长层级，无讲师层级）：候选人按部门分别报名并选择第一/第二志愿类型，志愿之间无互斥，不收集作品链接。
- 笔试评卷支持二维码扫码、手输学号查卷与分数汇总。
- 笔试招新的通过/不通过确认，附结果邮件锁定。
- 讲师面试评审与管理员最终审批。
- 飞书面试排期：OAuth 绑定、日程事件、视频会议预约、IM 卡片与提醒。
- 结果邮件中心：模板、批次、重试、限流、服务商回调与投递历史。
- 流程结果通过后回写 SAST Link 角色。
- 面向流程管理的 Link 用户查询、只读资料查看、角色编辑与账号封禁。
- 本地 PostgreSQL 开发库与演示种子数据，便于重复演示。
- Jest 单元/集成测试与 Playwright 端到端覆盖关键管理员与学生路径。

## 流程模型

流程类型在界面与流程列表里按**归属部门 + 阶段**语义化展示：`recruitment` = 软件研发部笔试 / 多媒体部笔试，`recruitment_exemption` = 软件研发部免试 / 多媒体部免试，`woc` = 软件研发部WOC / 多媒体部WOD，`soc` = 软件研发部SOC / 多媒体部SOD，`office_interview` = 办公室/科宣部/赛事部/外联部面试（`flowTypeLabel(type, department)`）。创建流程时直接选「部门 × 阶段」组合（`SEMANTIC_FLOW_TYPE_OPTIONS`），因此流程列表不再单列「归属部门」；管理员可修改已有流程的类型（`action/flow/type-change.ts`：仅管理员，且流程已有报名记录时拒绝），需要全局流程或列表外的类型时用「其他（自定义）」入口。

| 流程类型 | 步骤 | 最终角色效果 |
| --- | --- | --- |
| `recruitment` | 报名、评卷、录取确认 | 通过者成为部员 |
| `recruitment_exemption` | 报名、讲师评审、管理员评审 | 通过者成为部员 |
| `woc` | 报名、讲师评审、管理员评审 | 新同学成为部员 |
| `soc` | 报名、讲师评审、管理员评审 | 通过者成为讲师 |
| `office_interview` | **每个办公部门一条独立流程**：报名（选择志愿类型：第一志愿/第二志愿 + 面试时段）、一面、二面、结果确认 | 二面通过者成为部员 |

作品链接/作品简介只属于**技术部门面试流程**（免试/WOC/SOC）；笔试与办公类部门面试不收集作品。结果邮件模板按流程类型 + 部门维护：同一模板键可为每个部门存一份覆盖文案（`email_template_setting.department`），免试（`recruitment_exemption.result.*`）与笔试（`recruitment.result.*`）各自一套模板键，办公类各流程按本部门覆盖（含各自的 QQ 群号）。模板权限：管理员可编辑全局默认与任意部门；部长编辑本部门，并可只读浏览其他部门（`lib/email-center/template-access.ts`）。

结果发布后 People 会自动把成员身份同步回 SAST Link：角色（免试/笔试/WOC 任一通过 → 部员、SoC 通过 → 讲师、办公类两轮都通过 → 部员）与**部门归属**（通过某部门流程即归属该部门；办公类同一候选人通过多个部门时按部长团评议的「最终去向」，缺省「第一志愿优先」；`manager` 及以上账号不改动）——招新不再需要在 Link 手动改部门。

### `user_flow.progress_status`

| 状态 | 含义 |
| --- | --- |
| `not_started` | 已报名但尚未推进 |
| `ongoing` | 进行中或等待结论 |
| `passed` | 流程结论为通过/录取 |
| `failed` | 流程结论为不通过/拒绝 |

该枚举取代了早期的 `user_flow.status` 取值（`pending` / `accepted` / `rejected` / …），迁移映射见 [People 数据库结构](docs/PEOPLE_DATABASE_SCHEMA.md)。

### 相关状态

| 字段 | 取值 | 含义 |
| --- | --- | --- |
| `interview_evaluation.status` | `submitted`、`returned`、`approved`、`rejected` | 技术部门流程：讲师提交面评 → 部长退回重写或终审；已归档的通过/不通过在流程发布前可改判为相反结论（发布中/已发布锁定）；办公类提交即归档（保持 `submitted`，结果由部长在名单确认时决定） |
| `email_batch.status` | `draft`、`queued`、`completed`、`failed` | 结果邮件批次生命周期 |
| `email_delivery.status` | `pending`、`sending`、`sent`、`failed`、`dead` | 单个收件人的投递状态 |
| `interview_schedule.status` | `created`、`cancelled`、`failed` | 飞书面试排期状态 |
| `interview_checkin.status` | `waiting`、`called`、`interviewing`、`done`、`skipped`、`cancelled` | 办公类部门面试现场签到叫号状态（与 `progress_status` 正交，一人一轮一条） |

### 办公类部门面试（`office_interview`）

**流程与报名**

- **每个办公部门一条独立流程**：`flow.department` = 该办公部门；流程配置、权限、面试时段、评审、结果发布与邮件模板都归本部门，部门之间互不可见、互不干扰。
- 候选人**分别报名**：在每个部门流程各报一次，报名时选择**志愿类型**（第一志愿 / 第二志愿）与面试时段。进行中的办公类报名最多两条，且必须一个第一志愿 + 一个第二志愿（不能两个第一志愿）；**没有互斥**——两个志愿部门可以同时面试。
- `user_flow.choice` 记录志愿类型（1=第一志愿、2=第二志愿）；办公类报名不收集作品链接/简介。
- **取消报名**只在候选人**尚未进入流程**（后面任一步骤还没结束）前提供：提交报名时系统会把当前步骤写成「报名」的下一步，所以「刚报名、还没被处理」的候选人都能取消；一旦推进到再下一步（某个后续步骤已结束）按钮不再显示，服务端同样拒绝（`unregister` 在同一事务里校验当前步骤是否仍在报名后的前两步内）。

**面试记录与名单确认**

- **面试记录只留档**：办公类没有讲师这一级，面试记录 = 分数（0-100）+ 记录内容 + 可选「面试意见（建议通过/建议不通过，仅供参考）」；意见不参与结果判定，**没有会议链接/妙记**（办公类不产生飞书会议）。名单确认时会展示每位候选人当时的均分与份数，确认结果与分数快照写入操作审计留档。
- **没有面评审批**：技术部门由讲师提交面评、部长二次终审；办公类由部长直接决定结果，所以办公类面评提交即归档，不进入面评审批页。面试表格按「志愿」口径展示第一志愿/第二志愿与另一志愿部门。
- **名单确认制收口每一轮**（部长操作）：
  - **结束一面**：在名单弹窗里逐人确认通过/不通过（附当前记录均分与份数，无记录会有提示）→ 确认邮件模板 → 确认发送。通过者进入二面、未通过者结束流程，同时发送一面结果通知（`office_round1.result.accepted|rejected`，已发送的不重复）；名单已清空时仍可再次打开弹窗补发未发送的通知。
  - **结束二面**：同一弹窗确认最终名单（同一人通过多个部门时在「最终去向」里选择归属，冲突由双方部门讨论决定）→ 确认模板 → 确认发布，写入最终结果并发送结果邮件（`office_round2.result.*`）。
  - 邮件队列不可用时名单确认仍然生效，界面会提示稍后补发（再次打开弹窗即可重发未发送的通知）。
- 结果邮件都在各自流程内发送，模板与 QQ 群号按本部门维护（两轮各不相同）。

**面试管理与归档**

- **一面/二面在界面上分开**：面试管理顶部「一面 n / 二面 n」切换——一面视图看单人「最终分」与面试时段（可点改），二面视图看 2-3 位部长的「平均分」（评分不足时提示待评分），结果发布只在二面视图出现；页签按「部门 × 阶段」语义化拆分（软件研发部免试 / 多媒体部WOD / 办公室面试 …）。
- **归档查看**：候选人行操作菜单的「查看全部记录」弹窗汇总两轮面评（面试官、分数、意见、内容、时间）与每轮名单确认结论（通过与否、确认时间、操作人、确认时刻均分与份数）；结果快照按轮留存均分，导出 CSV 含 志愿 / 投递部门 / 面试时段 / 一面均分 / 二面均分 / 最终去向。
- **最终去向**：同一候选人通过多个办公部门时按「第一志愿优先」自动归属；部长团评议可在名单确认时逐人设置最终去向（写入 `user_flow.final_department`，立即同步成员部门），避免发布顺序影响归属。
- **面试时段**：候选人在报名时从本流程配置的时段中选择（含「时间冲突，约面时间QQ群中另行通知」特殊选项）；**需要改时间时私下联系部长**，由部长在面试管理页直接点击候选人的「面试时段」单元格修改（`updateCandidateInterviewSlot`，记录操作审计）——办公类不再有改期申请/审批，面试管理也支持按时段筛选候选人。

**现场签到叫号（`/dashboard/checkin`，大屏 `/checkin/board`）**

- 多个办公部门共用签到台与一块大屏，页面**不按部门切分**，一页列出全部办公部门的面试位与队列。
- **签到**：扫候选人的「我的资料 · 身份码」，或在「未签到名单」里按姓名/学号/部门手动签到；同一同学若同时有第一/第二志愿，弹窗逐条列出、可分别签到。
- **排队顺序 = 签到时间**，号码按**部门号段**编（拼音首字母：办公室 `B001`、科宣部 `K001`、外联部 `W001`、赛事部 `S001`），先到先叫、跨部门不重号；一面/二面各自从 001 起。
- **面试位**：每个部门可自己配置并行几个位；新增要**选部门（仅四个办公部门）+ 填名称**，可改名 / 暂停 / 删除。部长在自己位点「叫下一位」取本部门队首，或在队列行「叫到…」里指定到某个空闲位。
- **正在别部门面试 → 自动跳过、不阻塞**：叫号直接叫本部门下一位空闲候选人，被跳过的人保留队列位置，面完回来优先补叫。**第一志愿只做优先、不做硬挡**（没有别人可叫时照样叫），所以队列不会被卡住。
- **过号**：号码不变，**往后顺延 3 位**（相对还能被叫的人；不足则到队尾）；同一个人**最多自动重排一次**，第二次过号后就不再自动叫号（人可能已经走了），需要部长手动重呼或取消签到。
- **一/二志愿各自排队**：一条面完后另一条立即恢复可叫；队列与扫码弹窗都会标出「另有 X」。
- **边面边写面评**：面试位卡片上直接有**「写面评」**（面试中就能写，不必等结束），弹窗里填分数 + 记录内容（可选面试意见），与面试工作台同一套数据（`createEvaluation`）；已写过会显示「我已记录 · n 分」。**全程不离开本页、不新开标签页**。
- **手机优先**：默认选中**自己的部门**（`?dept=office` 可收藏），现场按「现场 / 签到台」两段；**面试位与队列合并在一个部门块里**，不需要在两个页签之间来回切。每个部门块只列等待/过号/已完成，正在面试的人只在面试位卡片上出现一次（不再重复一行）。
- **减噪**：等待态不染色、次要动作（过号 / 取消签到）收进 `⋯`、每行两行结构（号码 + 姓名一行，说明与操作一行），名字不会再被按钮挤掉。
- **大屏整屏显示、不滚动**：按部门数自动 1–4 列平分，面试位卡片 + 紧凑等候队列（超出显示「还有 n 位」）。可开启浏览器语音播报：**同一号最多念 3 次、间隔 5 秒**，人到场（进场/过号）即停；多人同时叫号时**串行播报**（不互相打断），一拍多于一条会合并成一句，超过 2 分钟的旧叫号不补念（避免刷新后把历史念一遍）。
- 权限：**所有部长**（role ≥ 3）。
- **演示数据**：`pnpm db:seed:demo` 会一并灌好演示数据：mock Link 里有一批办公类面试候选人（uid 301–312），四个办公部门各有 1–2 个面试位；一面在等候的人数约 办公室 8 / 科宣部 6 / 外联部 4 / 赛事部 5（其中含正在面试与已完成的），另有 8 人在「未签到名单」里；二面也有已完成与等候记录。足以把「叫下一位 / 过号 / 一志愿未面完 / 正在别部门面试」都点出来。

### 技术部门改约申请

技术部门（免试/WOC/SOC）改约申请（`interview_slot_change_request`）保持「候选人申请 → 预约该日程的讲师处理」：讲师会收到飞书卡片提醒，同意后飞书日程与留档会议同步改期并发改约邮件；暂不改期需填写说明并邮件告知候选人。改约申请只对预约讲师可见，列表按所选流程显示，不会串到其他流程。

## 技术栈

| 层次 | 技术 |
| --- | --- |
| 框架 | Next.js 16 App Router、React 19 |
| 界面 | Tailwind CSS v4、shadcn/ui、Framer Motion |
| 数据库 | PostgreSQL、Drizzle ORM |
| 鉴权 | 加密 Cookie 会话、SAST Link OAuth、可选飞书 OAuth 绑定 |
| 数据获取 | Server Components、Server Actions、SWR |
| 后台任务 | Inngest |
| 邮件 | react-email、nodemailer、飞书 SMTP |
| 外部集成 | 飞书 / Lark 开放平台、SAST Link |
| 可观测性 | Sentry |
| 测试 | Jest、Testing Library、Playwright |

## 快速开始

环境要求：

- Node.js 20+
- pnpm（版本以 `package.json` 的 `packageManager` 字段为准）
- Docker（推荐，Compose 使用 PostgreSQL 16）或自备 PostgreSQL 实例

```bash
pnpm install
cp .env.example .env.local
pnpm db:dev:up
```

在 `.env.local` 中填写：

```env
DATABASE_URL=postgres://sastpeople:sast_dev_password@localhost:55432/sastpeople_local
SESSION_SECRET=replace-with-a-long-random-string
```

然后：

```bash
pnpm db:migrate
pnpm db:seed:demo
pnpm dev
```

默认开发服务器地址：

```text
http://localhost:3000
```

种子数据中的本地管理员账号：

```text
student_id: 001
```

## 本地数据库

### Docker PostgreSQL（推荐）

```bash
pnpm db:dev:up
```

```env
DATABASE_URL=postgres://sastpeople:sast_dev_password@localhost:55432/sastpeople_local
```

停止或查看容器：

```bash
pnpm db:dev:logs
pnpm db:dev:down
```

### 宿主 PostgreSQL

把 `DATABASE_URL` 指向任意本地 PostgreSQL 实例，然后执行：

```bash
pnpm db:migrate
pnpm db:seed:demo
```

### SAST Link

SAST Link 负责用户身份与资料。请为目标 Link 环境配置 `LINK_*` 变量。

- `LINK_USE_MOCK=true` 仅在 Link 不可用时作为临时本地桩使用。
- 生产环境或真实用户测试**不得**开启 `LINK_USE_MOCK=true`。

## 完整开发模式

```bash
pnpm dev:full
```

`pnpm dev:local`、`pnpm dev:all`、`pnpm dev:full` 都执行 `scripts/dev-all.mjs`，会启动：

- Docker Compose（`docker-compose.dev.yml`）：本地 PostgreSQL 16（端口 `55432`）与 Inngest dev server（`8288`/`8289`，回调 `http://host.docker.internal:3001/api/inngest`）
- Next.js（端口 `3001`）
- 邮件预览服务（端口 `3002`）

启动前脚本会先收掉上一次运行留下的实例（记录在 `tmp/dev-all.pid`，并按 `3001`/`3002` 端口兜底），因此崩溃或被遗忘的进程不会阻塞下一次启动；需要 Docker Desktop 处于运行状态，且上述端口未被占用。`Ctrl+C` 会同时停止应用进程与容器。

### 本地测试账号（Link mock）

开启 `LINK_USE_MOCK=true` 后，登录页会列出全部 mock 账号，点击即可填入学号。账号覆盖全部七个部门：

| 学号 | 角色 | 部门 |
| --- | --- | --- |
| `B00000000` | 管理员 (role 4, Link `admin`) | 跨部门 |
| `B11111111` … `B77777777` | 部长 (role 3, Link `manager`) | 软件研发部 / 多媒体部 / 电子部 / 办公室 / 外联部 / 科宣部 / 赛事部 |
| `B<d>0000001` | 讲师 (role 2, Link `lecturer`) | 对应部门，例如 `B10000001` |
| `B<d>0000002` / `B<d>0000003` | 部员 (role 1, Link `member`) | 对应部门，例如 `B10000002` |
| `B00040001` … `B00040011` | 原有演示账号 | 混合角色与部门 |

`pnpm db:seed:demo` 会灌入演示部门与邮件模板行；`B00000000`（Link user id `101`）是 mock `admin`，可直接管理部门与模板。

## 环境变量

复制 `.env.example` 为 `.env.local` 并填入本地值：

```bash
cp .env.example .env.local
```

密钥只放在 `.env.local`，不要提交真实 `.env*` 文件。

### 本地开发必需

| 变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串 |
| `DATABASE_MIGRATION_URL` | 可选的迁移连接串；生产应使用独立的、具备 DDL 权限的发布账号 |
| `DATABASE_POOL_MAX` | 生产必需：单进程 PostgreSQL 连接上限。本地默认 `20`；生产需按所有 web 与 worker 进程折算，使连接池总和不超过数据库预算 |
| `DATABASE_POOL_IDLE_TIMEOUT_MS` / `DATABASE_POOL_CONNECTION_TIMEOUT_MS` | 可选连接池超时（毫秒，默认 `30000` / `10000`；`0` 表示禁用该超时） |
| `SESSION_SECRET` | Cookie 会话加密密钥 |
| `LINK_CLIENT_ID` / `LINK_CLIENT_SECRET` | SAST Link OAuth 应用凭据 |
| `LINK_API_BASE_URL` | Link JSON API 基址 |
| `LINK_AUTH_BASE_URL` | Link OAuth authorize / token 基址 |
| `LINK_OAUTH_SCOPES` | 基础 scope（默认 `openid profile email user:read`） |
| `LINK_ADMIN_OAUTH_SCOPES` | 完整 People scope，登录时一次性申请（默认 `openid profile email user:read admin:read admin:write`） |
| `LINK_USE_MOCK` | 仅在 Link 真实接口就绪前使用；生产必须为 `false` |
| `LINK_LOGIN_FEISHU_TEST_MOCK` | 仅本地测试开关：把 Link 登录会话角色强制为 lecturer，并跳过 Link lark 身份 union_id 匹配 |
| `NEXT_PUBLIC_LINK_PROFILE_URL` | 只读资料界面跳转的 Link 个人主页地址 |

### 常用可选集成

| 变量 | 用途 |
| --- | --- |
| `PEOPLE_PUBLIC_BASE_URL` | 飞书机器人卡片与回调使用的 People 公网地址 |
| `FEISHU_OAUTH_REDIRECT_URI` | 必须与飞书开发者后台白名单完全一致 |
| `FEISHU_EVENT_VERIFICATION_TOKEN` / `FEISHU_EVENT_ENCRYPT_KEY` | 飞书事件订阅校验 |
| `APP_ID` / `APP_SECRET` / `NONCESTR` | 面试排期使用的飞书应用凭据 |
| `FEISHU_INTERVIEW_CALENDAR_ID` | 新建面试日程所用的共享日历 |
| `FEISHU_INTERVIEW_CHAT_ID` | 可选：面试排期卡片通知群（隐私安全） |
| `FEISHU_APPROVAL_CHAT_ID` | 可选：管理员审批通知群 |
| `FEISHU_FEEDBACK_CHAT_ID` | 可选：关于页开发者反馈通知群 |
| `FEEDBACK_FEISHU_GROUP_URL` | 关于页展示的飞书群邀请链接（邀请 token 不要入库） |
| `INNGEST_DEV` | 本地置 `1`；生产必须改用 `INNGEST_SIGNING_KEY` |
| `EMAIL_*` | SMTP、重试策略（`EMAIL_RETRY_*`）、限流（`EMAIL_SEND_RATE_LIMIT_PER_MINUTE`）、投递记录保留（`EMAIL_ATTEMPT_RETENTION_DAYS`）、回调密钥（`EMAIL_WEBHOOK_SECRET`）与非生产收件人保护（`EMAIL_TEST_RECIPIENT`） |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | 运行时错误上报 |
| `SENTRY_BUILD_PLUGIN` | 仅在确需 Sentry 构建期处理时置 `true` |

### 生产运行时环境变量

生产 Docker 部署的运行时密钥存放在服务器：

```text
/data/sast-people-next/.env
```

`docker-compose.yml` 通过 `env_file` 加载该文件。GitHub Actions 在部署时不会重写生产运行时密钥。运行时密钥变更后，修改服务器文件并重建容器：

```bash
cd /data/sast-people-next
vim .env
chmod 600 .env
docker compose up -d --force-recreate
```

生产库结构迁移会在 `deploy.yml` 中、新应用镜像启用之前自动执行。迁移镜像与应用程序镜像来自同一提交，并在配置了 `DATABASE_MIGRATION_URL` 时使用该账号；`DATABASE_URL` 应限制为应用运行时账号。

该流程不需要重新构建或拷贝镜像。构建期公开变量（如 `NEXT_PUBLIC_SENTRY_DSN`）仍由 GitHub Actions 传入，因为 Next.js 会在 `pnpm build` 时内联 `NEXT_PUBLIC_*`。

`PEOPLE_PUBLIC_BASE_URL` 必须在生产环境配置，飞书机器人卡片才能回链 People。`FEISHU_OAUTH_REDIRECT_URI` 必须与飞书开发者后台白名单中的完整地址一致，例如 `https://people.sast.fun/api/auth/feishu`。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 启动 Next.js 开发服务器（端口 `3000`） |
| `pnpm dev:db` | `pnpm dev` 的别名 |
| `pnpm dev:local` / `pnpm dev:all` / `pnpm dev:full` | 启动本地 PostgreSQL + Inngest 容器、Next.js（`3001`）与邮件预览（`3002`）；启动前清理上次残留实例，Next.js 退出时一并关停 |
| `pnpm dev:all:down` | 停止完整开发模式启动的本地数据库容器 |
| `pnpm db:dev:up` | 启动本地 Docker PostgreSQL（端口 `55432`） |
| `pnpm db:dev:down` | 停止本地 Docker PostgreSQL |
| `pnpm db:dev:logs` | 跟踪本地 Docker PostgreSQL 日志 |
| `pnpm db:migrate` | 应用 Drizzle 迁移 |
| `pnpm db:generate` | 生成 Drizzle 迁移 |
| `pnpm db:push` | 直接推送 schema 变更 |
| `pnpm db:studio` | 打开 Drizzle Studio |
| `pnpm db:seed:demo` | 灌入演示流程与邮件快照数据 |
| `pnpm lint` | 运行 ESLint |
| `pnpm test` | 运行 Jest 测试 |
| `pnpm test:watch` | 以 watch 模式运行 Jest |
| `pnpm test:coverage` | 运行 Jest 并输出覆盖率 |
| `pnpm test:integration` | 运行 `jest.integration.config.ts` 下的集成测试（需要数据库） |
| `pnpm test:e2e` | 运行 Playwright 端到端测试 |
| `pnpm build` | 生产构建 |
| `pnpm start` | 运行生产构建产物 |
| `pnpm exec tsc --noEmit` | 仅类型检查，不产出文件 |

## 项目结构

```text
app/                    Next.js App Router 页面、布局与路由处理器
action/                 Server Actions（变更与流程操作）
components/             业务组件与共享组件
components/ui/          shadcn/ui 基础组件
const/                  共享常量
db/                     Drizzle schema 与数据库客户端
docs/                   项目文档与设计说明
e2e/                    Playwright 端到端用例
emails/                 react-email 邮件模板
event/                  领域/集成事件辅助
hooks/                  客户端数据 hooks
lib/                    DAL、会话、Link、飞书、邮件、审计、Sentry 等辅助
migrations/             按序排列的 Drizzle SQL 迁移
public/                 静态资源
queue/                  Inngest 后台任务
scripts/                种子、SQL 与 Playwright 辅助脚本
types/                  共享 TypeScript 类型
proxy.ts                Next.js 请求代理 / 中间件入口
instrumentation*.ts     运行时与客户端 instrumentation 入口
```

### 主要路由

| 路由 | 用途 |
| --- | --- |
| `/` | 重定向到 `/dashboard` |
| `/login` | 登录（mock 模式下可点选测试账号） |
| `/dashboard` | 首页 |
| `/dashboard/flow` | 流程管理 |
| `/dashboard/exams` | 笔试工作台（评卷与名单） |
| `/dashboard/recruitment` | 兼容入口：按流程类型重定向到 `/dashboard/exams` 或 `/dashboard/interviews` |
| `/dashboard/review` | 评卷 |
| `/dashboard/interviews` | 面试管理（技术部门 + 办公类） |
| `/dashboard/checkin` | 办公部门共享的面试签到叫号台（大屏在 `/checkin/board`） |
| `/dashboard/user-flow` | 用户流程管理 |
| `/dashboard/approvals` | 面试评审终审 |
| `/dashboard/emails` | 邮件中心 |
| `/dashboard/departments` | 部门归属管理 |
| `/dashboard/manage` | 用户管理（数据来自 Link） |
| `/dashboard/feedback` | 反馈处理 |
| `/dashboard/audit` | 操作审计日志 |
| `/dashboard/error-log` | 服务端错误日志 |
| `/dashboard/about` | 关于与反馈入口 |
| `/checkin/board` | 签到叫号大屏 |
| `/health` | 健康检查 |

## 数据库

Schema 定义在 `db/schema.ts`。迁移位于 `migrations/`，必须按数字前缀保持有序。

当前核心表：

| 表 | 用途 |
| --- | --- |
| `flow` | 流程定义 |
| `flow_step` | 流程步骤 |
| `user_flow` | 用户报名与流转状态 |
| `problem` | 笔试卷题目 |
| `user_point` | 评卷记录 |
| `flow_result_publication` | 结果发布记录与分数快照 |
| `interview_evaluation` | 面试评审与最终审批 |
| `interview_schedule` | 飞书面试日程与会议记录 |
| `interview_schedule_cancellation_outbox` | 日程取消的飞书同步重试队列 |
| `interview_slot_change_request` | 面试时段变更申请 |
| `interview_station` | 办公类部门面试位配置 |
| `interview_checkin` | 办公类现场签到叫号记录 |
| `user_oauth_account` | People 侧第三方 OAuth token 绑定 |
| `people_session` | 服务端会话 |
| `email_template_setting` | 结果邮件模板设置 |
| `email_template_content` | 共享邮件模板内容 |
| `email_batch` | 结果邮件发送批次 |
| `email_delivery` | 单个用户的投递记录 |
| `email_delivery_attempt` | 发送尝试与服务商回执 |
| `email_send_rate_limit` | 全局限流桶 |
| `operation_audit` | 管理操作审计日志 |
| `feedback_report` | 用户反馈记录 |

People 业务表在 v3 迁移后存储 Link 用户 ID。字段级细节见 [People 数据库结构](docs/PEOPLE_DATABASE_SCHEMA.md)。

## 验证

提交 PR 或部署前执行：

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

单点 Jest 测试：

```bash
pnpm test -- --runInBand components/recruitment/table.test.tsx
```

Playwright 用例位于 `e2e/`：

```bash
pnpm test:e2e
```

CI 编排见 [CI_CD.md](CI_CD.md)；发布与预发人工检查见 [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)。

## 文档索引

| 文档 | 用途 |
| --- | --- |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献与 PR 检查清单 |
| [TESTING.md](TESTING.md) | Jest 与 Playwright 测试指南 |
| [CI_CD.md](CI_CD.md) | 质检、测试、部署与发布工作流 |
| [CHANGELOG.md](CHANGELOG.md) | 变更记录 |
| [docs/PEOPLE_DATABASE_SCHEMA.md](docs/PEOPLE_DATABASE_SCHEMA.md) | People 数据库结构权威定义 |
| [docs/SAST_PEOPLE_V3_LINK_DEV.md](docs/SAST_PEOPLE_V3_LINK_DEV.md) | v3 Link 集成方案 |
| [docs/FEISHU_INTERVIEW_SCHEDULING_PLAN.md](docs/FEISHU_INTERVIEW_SCHEDULING_PLAN.md) | 面试排期设计 |
| [docs/FEISHU_GITHUB_NOTIFICATIONS.md](docs/FEISHU_GITHUB_NOTIFICATIONS.md) | 飞书 GitHub 通知配置 |
| [docs/email-center-design.md](docs/email-center-design.md) | 邮件中心平台设计 |
| [docs/email-center-flow-redesign.md](docs/email-center-flow-redesign.md) | 邮件中心管理端工作流与信息架构 |
| [docs/department-access-control.md](docs/department-access-control.md) | 部门级数据权限模型与推进计划 |
| [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) | 发布与预发检查清单 |

## 注意事项

- 不要提交真实 `.env*` 文件，`.env.example` 是唯一入库的模板。
- 客户端只暴露 `NEXT_PUBLIC_*` 中的安全值。
- 本地界面与流程联调优先使用 Docker PostgreSQL。
- 使用依赖新枚举或新表的功能前，先执行迁移。
- Link 与飞书凭据不得进入客户端产物、日志或提交记录。
- `docs/` 默认不入库（`.gitignore` 中的 `docs/*` 加上显式白名单）：新增需要随仓库分发的文档，必须同时把该文件加进白名单，否则其他人 clone 后拿不到。
- 非生产环境的邮件发送默认受 `EMAIL_TEST_RECIPIENT` 保护，除非有意改配置。

## 许可

SAST People Next 由 NJUPT SAST 开发维护，以 [MIT License](LICENSE) 发布。
