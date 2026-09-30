# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- 面试管理工作台页签按**「部门 × 阶段」语义化拆分**（软件研发部免试 / 多媒体部WOD / 办公室面试 …），只展示实际有流程的组合；选中页签即定位该组合的最新流程。
- 办公类两轮在 UI 上区分：**一面视图**（单人「最终分」+ 面试时段，收口按钮「结束一面并发送通知」）与**二面视图**（2-3 位部长的「平均分」，不显示时段，评分不足时提示「待 2-3 位部长评分」），顶部「一面 n / 二面 n」切换带人数；结果发布只出现在二面视图。
- 候选人行菜单新增**「查看全部记录」**（办公类）：弹窗展示两轮面评（面试官 / 分数 / 意见 / 内容 / 时间）、每轮均分与名单确认结论（通过与否、确认时间、操作人、确认时刻均分与份数），即办公类的归档查看入口。
- 结果快照按轮留档：`flow_result_publication.result_snapshot` 行新增 `round1Average/round1Count/round2Average/round2Count`；办公类导出 CSV 增加「一面均分 / 二面均分」列；名单确认弹窗同时展示一面与二面均分。
- 流程类型改为**语义化「部门 × 阶段」选择**：软件研发部/多媒体部 = 免试 / 笔试 / WOC(WOD) / SOC(SOD)，办公类部门 = 面试（共 12 项，`SEMANTIC_FLOW_TYPE_OPTIONS` / `flowTypeLabel`），创建与编辑直接选组合；**流程列表不再单列「归属部门」**（类型名已含部门）。管理员可修改已有流程的类型（`action/flow/type-change.ts`：只有管理员可改，且流程已有报名记录时拒绝——报名数据按类型解释），列表外类型与全局流程仍可用「其他（自定义）」入口。
- 办公类面试管理支持**按面试时段筛选**候选人；列表内「面试时段」单元格可直接点击修改（部长 ≥ 3 级，`updateCandidateInterviewSlot`，记录操作审计）。办公类改时段不再走申请审批：候选人卡片提示「如需调整面试时段，请联系本部门部长」。
- 办公类面评支持可选的**「面试意见（参考）」**（建议通过/建议不通过）：只作留档、不参与结果判定，名单确认仍以面评分数与部长团确认为准。
- 办公类名单确认留档：结束一面/二面时把每位候选人的结果与当时的平均分/份数快照写进操作审计；办公类结果导出的 CSV 增加 志愿 / 投递部门 / 面试时段 / 最终去向 列。
- 邮件模板新增 `recruitment_exemption.result.accepted` / `.rejected`：**免试**与笔试结果通知不再共用一套模板键（各按部门覆盖）。
- 邮件模板管理：管理员可在下拉里选择部门目录中的**任意部门**（并保留手填），编辑任意部门与全局默认；**部长可只读浏览其他部门**的模板（徽章「其他部门覆盖」，无保存/恢复/测试发送按钮）。
- 改期申请支持技术部门面试流程（免试/WOC/SOC）：候选人给出希望改到的新时间（时长沿用原日程，申请理由必填），预约讲师收到飞书卡片提醒；同意后飞书日程与留档会议同步改期并发改约邮件，不同意需填写驳回理由并邮件通知候选人。办公类的改期入口见下方 Changed。
- 改期申请审批列表按所选流程加载：只显示当前流程的申请并展示流程名称，不再在其他流程页面串显。
- 办公类部门面试招新改为**每个办公部门一条独立流程**（`flow.department` = 办公部门）：流程配置、权限、面试时段、评审、结果发布与邮件模板都归本部门，部门之间互不可见、互不干扰；不再有 `department` 为空的共享办公流程
- 办公类报名改为**分别报名**：候选人在每个部门流程各报一次并选择志愿类型（`user_flow.choice`：1=第一志愿、2=第二志愿）与面试时段；进行中的办公类报名最多两条，且必须一个第一志愿 + 一个第二志愿；**取消办公部门互斥**（两个志愿部门可同时面试）
- 办公类「最终去向」：同一候选人通过多个办公部门时按「第一志愿优先」自动归属（`lib/flow-result-department.ts`）；部长团评议可在办公类流程的「完整名单」里逐人设置 `user_flow.final_department`，立即重新同步成员部门，避免发布顺序影响归属
- 办公类面试记录只保留**分数 + 记录内容**：去掉「建议通过/建议不通过」与飞书会议/妙记链接（办公类不产生飞书会议），提交成功提示改为「面试记录已保存」。
- 办公类**取消面评审批**：办公类没有讲师这一级，结果由部长直接决定，面评提交即归档；面评审批页不再展示办公类流程，`approveEvaluation`/`rejectEvaluation`/`returnEvaluation` 对办公类直接拒绝。
- 办公类两轮改为**名单确认制**（部长操作）：结束一面 → 名单弹窗逐人确认通过/不通过（附当前记录均分与份数）→ 确认邮件模板 → 确认发送（通过者进入二面、未通过者结束流程，并发一面结果通知）；结束二面 → 同一弹窗确认最终名单（含同一人通过多个部门时的「最终去向」选择，冲突由双方部门讨论决定）→ 确认模板 → 确认发布。邮件队列不可用时名单确认仍然生效，界面提示稍后重发（已发送的通知不重复）。
- 名单确认弹窗重做：宽表固定列宽、不再横向滚动，移动端卡片布局；提供「全部通过/全部不通过」与逐人切换，无面试记录的候选人会标出提示。
- 办公类流程改为部长口径：候选人列表、面评提交与改期审批都要求部长（`manager`）；办公流程界面上的「讲师」文案改为「部长」。
- 办公流程面试表格按志愿口径展示：`志愿`（第一志愿/第二志愿）+ `另一志愿部门`，隐藏作品列（办公类不收集作品）。
- 流程类型名称按归属部门显示：`软件研发部WOC / 多媒体部WOD / 软件研发部SOC / 多媒体部SOD / 软件研发部免试 / 多媒体部笔试 …`（`flowTypeLabel`），流程创建下拉、面试工作台页签、流程列表与部门归属表统一使用。
- 邮件模板新增 `interview.schedule.change.rejected`（面试改期未通过通知，含驳回理由变量）。

### Changed

- 改约申请只对**预约该日程的讲师**可见、可处理：管理员与其他讲师在列表里看不到、调用也拒绝（`listPendingSlotChangeRequests` / `reviewInterviewSlotChange` 都按日程发起人收敛）。
- 改约文案去「驳回」化：列表按钮与弹窗改成「同意改约 / 暂不改期」，暂不改期需填写**说明**；邮件模板 `interview.schedule.change.rejected` 显示名改为「面试暂不改期说明」，邮件标题/正文改成「关于面试时间调整的说明」，飞书提醒卡片同步措辞。
- 邮件模板命名对齐流程口径：笔试结果的模板与通知改名「笔试招新通过 / 不通过…」（免试、WoC/WoD、SoC/SoD、办公类各自成组）；模板卡片顶部色条按语义区分——通过用主色、**不通过用红色**，避免整页绿条看错。
- 本地演示数据补齐**全部门 × 全类型**流程：软件研发部 / 多媒体部 / 电子部的 笔试 / 免试 / WOC(WOD) / SOC(SOD) 加四个办公部门面试，共 17 条流程，每条带步骤与混合状态报名（面试类含 待审批 / 已通过 / 已驳回 / 退回重写 的面评，笔试类含题目与批卷分数）；流程标题、日程摘要与演示邮件统一成生产口径 `<年份> 校科协<部门> <阶段>`（如「2026 校科协软件研发部 笔试招新」「2026 校科协办公室 面试」）。seed 开头会清理历史脏数据（`test`、`E2E ...` 夹具流程及其邮件批次 / 发布记录）。
- 办公类步骤默认改为 **报名 / 一面 / 二面 / 结果确认**（`action/flow/defaultSteps.ts` 与流程编辑工作台一致）；修复编辑工作台对办公类套用「讲师审核 / 管理员审核」模板、保存后把二面步骤改成「管理员审核」的问题。
- 办公类改期审批下线：面试管理页不再展示待审批列表，候选人卡片不再有「申请改时间」入口（提示联系本部门部长，由部长在面试管理页直接改时段）；`interview_slot_change_request` 只服务技术部门（免试/WOC/SOC）的飞书日程改期；迁移 `0067_office_slot_change_cleanup` 关闭存量办公类 pending 申请。「时间冲突」特殊时段选项（`SLOT_CONFLICT_LABEL` / `isConflict`）保持可用。
- 修复越权读取：`getEmailTemplateSetting` 之前是未做角色/部门校验的 server action，任何部长会话可读取任意部门模板；现拆分为内部读取（`lib/email-center/template-resolution.ts`，不可从客户端调用）与带 `verifyRole(3)` + 部门范围校验的对外 action。
- 作品链接/作品简介仅技术部门面试流程（免试/WOC/SOC）收集：办公类与笔试报名不再显示、不再校验、落库强制为空；办公类没有投递组别（候选人/部长修改组别的入口对办公类直接拒绝）。
- `interview_slot_change_request` 升级：新增 `fk_interview_schedule_id`、`requested_starts_at/requested_ends_at`，`requested_slot` 允许为空（技术部门按时间申请），`reason` 改为必填；新增日程索引。
- 办公类流程配置与其它部门流程一致：创建时选择归属部门并配置本流程的面试时段，不再需要「可投递的办公部门」列表与「部门映射」；`user_flow.second_choice_department` 列删除，由 `choice` + 各自流程的报名记录取代。
- 邮件模板的办公类特例取消：`office_round1.*` / `office_round2.*` 与其它模板一样按 `(template_key, department)` 存部门覆盖，QQ 群号写在本部门模板的 `group_number` 里。

### Fixed

- 邮件中心「测试发送」默认模板：此前无论选中哪个流程，默认都会用**技术招新通过模板**（`recruitment.result.accepted`）发测试邮件，办公部门看起来像技术部门招新邮件；现在默认跟随当前流程类型（办公类 → 办公类一面通过模板、免试 → 免试模板、WOC/SOC 各自模板），模板下拉按「结果通知 / 面试通知」分组，弹窗同时显示当前流程名。
- `pnpm dev:local` 现在会在启动前收掉上次留下的开发环境实例：运行态文件（`tmp/dev-all.pid`：父进程 + 已启动子进程）与端口占用双重检测，只关闭本仓库的进程（Windows `taskkill /T`，POSIX `SIGTERM`），并容忍本项目 `inngest-dev` 容器占用 8288/8289
- `pnpm dev:local` 不再依赖 PATH 上的 `pnpm`：容器用 `docker compose` 直接管理，Next.js 与邮件预览用仓库内二进制（`node_modules/next/dist/bin/next`、`node_modules/react-email/dist/cli/index.mjs`）启动
- 邮件预览服务现在能真正启动：`@react-email/ui` 与 `react-email` 固定为同一版本（6.11.0），此前版本不一致会让 `email dev` 交互式提问后静默退出
- 导航与页面权限对齐：平台级入口「反馈记录」「错误日志」只对管理员展示（此前普通账号点进去会被重定向回我的资料页）；部门级入口（试卷批改/用户管理/笔试/面试/邮件中心/流程管理/面评审批/操作审计）对无部门归属的账号隐藏，避免进入后被重定向或看到空数据
- 修复邮件模板部门化后 `pnpm db:seed:demo` 失败：模板表唯一键已改为 `(template_key, coalesce(department, ''))`，种子数据的冲突目标同步更新

### Documentation

- Rewrite `README.md` to match the current v3 codebase: Link-owned identity, workflow model, Feishu interview scheduling, email center, dashboard routes, commands, and verification.
- Expand documentation index to cover PRD, schema, Feishu scheduling, email center, release checklist, CI/CD, testing, and contributing guides.
- Update `TESTING.md` with Playwright e2e coverage and current test commands.
- Align `CONTRIBUTING.md` with database, seed, and e2e workflows.

### Added

- 流程结果自动同步**部门归属**：通过某部门流程后自动把成员归属到该部门（无需在 Link 手动改）；先后通过多个部门时以**最后一次通过**的部门为准（可覆盖），办公类同一候选人通过多个部门时按部长团评议的「最终去向」或「第一志愿优先」归属；不会改动部长及以上账号的部门。同步使用 `PUT /admin/users { ids, department }`，与角色同步同一发布路径
- 办公类一面结果通知：面试管理页「发送一面结果通知」批量发送**一面通过与未通过**两类邮件（按钮与确认弹窗显示「通过 N 人 · 未通过 M 人」），一面未通过者不会在流程结束时再收到一次不通过邮件（最终结果批次只覆盖进入二面阶段的候选人）
- 办公类邮件模板按部门维护：`office_round1.*` / `office_round2.*` 与其它模板一样使用部门覆盖（每个办公部门各一份文案与 QQ 群号）；办公类邮件不混入邮件中心的通用「发结果通知」通道（面试管理页单独发送，发送记录与重试保留）
- 办公类部门面试招新（`office_interview`）采用**每个部门一条流程 + 流程内两轮**：报名、一面、二面与结果确认都在本部门流程内完成；一面通过后自动推进到二轮面试（无需二次报名），两轮都通过后才 `passed` 并同步部员角色
- 办公类新增 `interview_evaluation.round` 记录面评所属轮次；工作台按候选人当前阶段统计平均分与排序，分数弹层展示每份面评的轮次
- 办公类面试报名后修改面试时段改为「候选人申请 → 部长审批」：新增 `interview_slot_change_request` 表与面试管理页待审批列表，审批通过后写回报名时段，全程操作审计
- 面试互斥取消：技术部门之间、办公部门之间、技术 + 办公都可以同时参加；办公类仅限制「最多两条进行中的报名（一志愿 + 二志愿各一条）」
- 流程读写的可见范围细分：候选人报名与流程管理列表展示全部流程（编辑权仍按流程归属部门收敛），试卷批改/笔试管理/面试管理的流程选择器只展示与本部门相关的流程
- 面评审批支持管理员按部门筛选（部长仍只见本部门数据）
- 成员目录（与成员详情）不再按部门过滤：讲师及以上均可查看全部成员，仅敏感字段按角色收敛（手机号 role ≥ 3、QQ role ≥ 2）；部门隔离继续作用于流程/报名/评分/面评/排期/邮件/审计
- 适配 SAST Link 新增的 `manager`（部长）角色（Link issue #249）：People 角色阶梯改为 `0` 新同学 / `1` 部员 / `2` 讲师 / `3` 部长 / `4` 管理员，管理员权限直接取自 Link `admin`（角色 4）
- 部门字段口径统一：人的部门叫「所属部门」（只读自 Link，成员目录/资料页/详情页），报名记录的部门叫「投递部门」（笔试/面试/面评表与结果名单），流程与审计用「归属部门」；空白分别显示「未设置部门」/「未归属部门」
- 部门权限隔离：流程、报名、评分、面评、面试排期、结果发布、邮件与操作审计按部门收敛，未归属部门的记录只有管理员可见；`/dashboard/departments` 提供部门概览与流程/报名归属分配。见 `docs/department-access-control.md`
- 邮件模板支持部门覆盖：结果通知与面试通知模板按 `(template_key, department)` 存储，渲染时部门覆盖优先、回落全局默认；部长维护本部门文案，管理员维护全局默认与任意部门
- 本地 mock 登录改为「身份 + 部门（或账号）」下拉选择后一键登录：管理员 / 部长 / 讲师 / 部员 / 新同学，选择身份后按部门挑选对应账号（同部门多个账号如两位部员可再选具体账号），并保留「手动输入学号」折叠入口
- 本地 mock 账号扩充：管理员 `B00000000`、七个部门的部长 `B11111111`–`B77777777`、讲师 `B<d>0000001` 与部员 `B<d>0000002`/`B<d>0000003`
- 本地 mock 会话按登录用户解析资料与部门（`mock-access-token:<id>`），多账号演示时不会再互相串号
- Interview flows accept a per-flow configurable list of apply groups (投递组别); candidates pick one when registering and it shows in the interview workspace and the candidate's flow card
- Interview lecturers can require a return reason when withdrawing a candidate; the reason is stored and shown on the candidate's flow card
- Interview return actions send candidates an email with the return reason and suppress duplicate cancellation emails when an active interview schedule is withdrawn
- Written exam and interview management tables open a user detail sheet when a candidate's name is clicked (profile, contact info, capabilities, Link identities)
- Link OAuth denial (e.g. user rejects authorization) now redirects to the login page with a friendly error banner instead of a raw JSON error
- Apply groups are editable after registration: candidates can change their own group while their interview flow is in progress, and lecturers/admins can mark or fix the group for any candidate from the interview workspace
- Next.js 16 App Router application for SAST recruitment and review workflows
- React 19 UI with Tailwind CSS v4 and shadcn/ui
- PostgreSQL + Drizzle ORM schema, migrations, and local seed scripts
- SAST Link OAuth integration for identity, profile, role, and account administration
- Recruitment / exemption / WOC / SOC workflow models and dashboard operations
- Written exam grading with QR-code scanning and score aggregation
- Interview evaluation with administrator final approval
- Feishu interview scheduling: OAuth binding, calendar/VC, bot cards, reminders
- Email center with templates, batches, retries, rate limits, webhooks, and attempt history
- Inngest background jobs for email and interview reminder flows
- Optional server-side AI drafts for summaries and evaluations
- Sentry instrumentation and server error logging
- Jest + Testing Library unit/integration tests
- Playwright end-to-end tests for recruitment, email center, and visual smoke paths
- GitHub Actions quality, test, deploy, and release workflows
- Docker development database and production deployment compose files

### Changed

- `user_flow` progress model simplified to `progress_status`: `not_started` / `ongoing` / `passed` / `failed`
- People business tables store Link user IDs after the v3 migration
- Production runtime secrets are managed on the server via `/data/sast-people-next/.env`

### Removed

- Desktop wrapper, Rust build pipeline, and related tooling
- Stale documentation claims such as a missing Chinese README file

## [0.1.0] - 2024-01-28

### Added

- Initial release scaffold with Next.js App Router and basic UI components
