# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- 办公类一面名单确认弹窗新增**「打开邮件模板页核对」**按钮（新标签页打开 `/dashboard/emails?tab=templates&department=<本部门>`）：勾选「已核对模板」前可以先跳过去看本部门的一/二面通过、不通过模板，核对完回来继续确认名单并发送，名单勾选状态不丢。
- 管理员**切换身份查看**：顶栏「切换身份」可按任意身份（新同学/部员/讲师/部长/管理员）× 任意启用部门浏览系统，用来核对各部门实际看到的导航、数据范围与界面效果。实现是浏览器上的加密临时视角 cookie（`VIEW_AS`，只对管理员会话生效，伪造无法提权），会话本身、uid、Link token 都不改；顶栏常驻琥珀色提示条 + 「退出切换」一键回到管理员，每次切换/退出都写操作审计（`session.view-as.start` / `session.view-as.stop`）。为配合它，`verifySession` 额外返回 `realRole` 与 `viewAs`，`app/dashboard/layout.tsx` 回写 Link 资料时固定用真实角色，避免临时视角被写进会话。
- 流程管理里**只读流程可以点进详情**：没有编辑权的流程（其他部门）操作列从一行「只读」文字改为「查看流程」入口，打开 `/dashboard/flow/edit?id=…` 的只读视图——标题显示「查看流程 + 只读」，整页表单用 `fieldset[disabled]` 一次性禁用并隐藏保存按钮。跨部门查看时**试卷题目不查询、不下发**，改为一行说明（题目只有归属部门可见），避免考题跨部门泄露；`isFlowVisibleToScope` 复用与列表同一套可见性谓词。
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

- **办公类结果邮件的主题不再带候选人姓名**（`lib/email/template-settings.ts`、`lib/email-center/registry.ts`、`migrations/0070_office_email_subject_without_name.sql`）：内置主题曾是 `{name}{department}一轮面试结果通知`，于是邮件中心的「发送记录」与待发卡片显示成「张三办公室一轮面试结果通知」——每封投递各带不同姓名、批次却只能存一个代表性主题，看起来像整批只发给某个人，也与其他流程（「2026 春季招新 结果通知」）的读法不一致。现在内置默认改为 `{department}一轮面试结果通知` / `{department}面试结果通知`；批次级主题与流程卡片主题渲染时 `{name}` 留空（个人化只保留在正文称呼与每封投递自己的标题里），迁移 `0070` 把仍是旧默认的落库行改写过来。部门想要姓名进主题，仍可在模板里写 `{name}`。
- **「测试发送」的模板列表按部门阶段收窄**（`components/email/EmailTemplateManagementSection.tsx`）：下拉与卡片此前口径不一致——卡片已按「部门 × 阶段」过滤，测试发送下拉却是全部模板，办公部门的部长能看到笔试/免试/WOC/SOC 与飞书日程模板，容易误以为这些也要自己维护。现在下拉与卡片同一套过滤（办公部门 = 一面/二面 + 报名退回；技术部门 = 笔试/免试/WOC/SOC + 面试通知），跟随流程类型的默认键被过滤掉时回落到第一个可选项；已选中的模板被新部门过滤隐藏时同样回落到默认键，发送不会再带上下拉里已经看不见的模板。
- **面评审批卡片信息重排**（`components/manage/approvalsContent.tsx`）：姓名、学号、讲师建议与最终结果徽章现在排在同一行且徽章靠右对齐（此前姓名触发按钮是块级元素，桌面端就把学号挤到下一行；移动端学号还被 `hidden sm:inline` 隐藏），移动端同样显示学号；去掉「投递部门」一行（部门隔离下流程名本身已体现部门，投递组别保留）。
- **飞书绑定失败的提示改为中心弹窗**（`components/feishu-oauth-failure-dialog.tsx`、`app/dashboard/page.tsx`）：原来的右下角 toast 会被飞书授权页盖住，用户看不到「当前 Link 账号未绑定飞书身份」这类失败原因。现在失败原因固定显示在屏幕中央：Link 未绑定飞书时提供**「去 Link 绑定飞书」**（新标签页打开 `NEXT_PUBLIC_LINK_PROFILE_URL` 的 `/settings`，默认 `https://link.sast.fun/settings`）与「重新绑定飞书」，账号不匹配 / 授权中断提供「重新绑定飞书」；URL 参数清理与「刷新不再弹」的行为保持原样（`components/feishu-oauth-failure-toast.tsx` 删除）。
- 办公部门**没有讲师这一级**：切换身份查看里「讲师」只在技术部门可选（选中办公部门时禁用并提示，部门下拉标注「（无讲师）」，服务端 `startViewAs` 同样拒绝），避免切出「办公室讲师」这种不存在的身份。
- 笔试管理表格支持**表头排序**（学号 / 姓名 / 投递部门 / 状态 / 总分，默认总分从高到低，空分数固定沉底），与面试表同一套箭头与交互；面试表的「面试时段」「最终分 / 平均分」排序继续保持可用（办公类按流程配置的时段顺序排、没选时段的沉底）。
- 办公类候选人「全部面试记录」里的「名单确认」空态改成说明性文案（该轮还没有确认名单 → 部长结束该轮后会留档结论 / 操作人 / 确认时刻均分与份数），不再只给一句「尚无名单确认记录」。
- 面评审批工具条在窄屏重排：视图切换 + 部门筛选同一行，归档搜索整行，三个筛选下拉排成两列网格，不再互相挤压、搜索框也不会塌成一条缝（桌面端保持一行）。
- 电子部**暂时下线**（`DISABLED_DEPARTMENT_KEYS` + `isDepartmentEnabled`，`const/department.ts`）：它的流程不再出现在面试管理/笔试管理的流程选择器与部门页签、流程管理列表、以及邮件模板的「模板归属」下拉；流程、报名记录与模板数据全部保留（部门管理的归属表仍能看到并可纠正），以后启用时把 `electronics` 从常量里删掉即可。


- 面试/笔试管理工作台表格：表头加 `bg-muted/40` 底色与正文行区分（与笔试表一致）；页签栏活动项改用主色下划线 + 加粗、部门分组标题降到 11px 弱化，并让页签按内容宽度收缩（只有一个组合的部门不再出现一条横贯整卡的绿线）。
- 邮件模板展示名统一到**「部门 × 阶段」口径**（`const/flow.ts` 的 `emailTemplateLabel`）：归属到具体部门就写部门名——软件研发部WOC / 多媒体部WOD / 软件研发部SOC / 多媒体部SOD / 办公室一面，全局默认才用通用阶段名（WOC/WOD、部门面试一面）；不再出现「办公类一面通过通知」这类与部门脱节的模板名（模板卡片、弹窗标题、测试发送下拉、发送记录都按投递部门显示）。同时模板板块只列出该部门真正会跑的阶段（技术部门 = 笔试/免试/WOC/SOC，办公部门 = 一面/二面），卡片按阶段排序（笔试 → 免试 → WOC/WOD → SOC/SOD → 一面 → 二面）；面试通知模板同样按部门过滤——办公类不再看到用不到的飞书日程类通知（预约 / 改约 / 取消 / 暂不改期），只保留「面试报名退回通知」。
- 模板板块排版重做：归属说明只写一次（卡片上原来每张都重复同一句话），卡片只保留「模板名 + 生效来源徽章 + 编辑/测试发送」，通过/不通过的重复色条与整页灰字勾注消失。
- **面评审批**页顶部工具条重做：改为「待审批 n / 已归档 n」分段页签 + 部门筛选 + 归档筛选同一行，去掉原来把三个控件拉到屏幕两端的大卡片（`components/manage/approvalsContent.tsx` 里只动这一处，卡片与页头保持原样）。
- **面试/笔试管理工作台**头部重做：页签按部门分组（「软件研发部 免试/WOC/SOC」部门名只写一次，仅一个阶段的部门保留完整名如「办公室面试」），页签栏隐藏原生滚动条并在溢出时两端渐隐；流程选择器与轮次切换、主操作、笔试统计分左右两列排布；候选人表格在 lg（1024）下不再产生内层横向滚动条，并给出可见的横向滚动条样式。
- **部门管理**改为**概览 / 流程归属 / 报名记录归属**三个页签（原来三张表竖着堆成近 3000px），概览的四个统计块重做并给部门加「技术/办公」标签；流程归属表在没有任何流程配置组别映射时不再显示整列「无组别映射」。
- 邮件中心导航改为下划线式页签；系统状态页把「今日成功 / 今日失败 / 进行中」拆成三个计数块（原来挤在一行句子里）；发送记录的筛选按钮与筛选控件统一为 h-9，记录行的操作按钮在窄屏排成两列（原来三个整行按钮）。
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

#### 操作审计

- **管理员的操作记录显示为「部长」**（`migrations/0069_audit_view_as_actor_role_fix.sql`）：PR #250 合并前的分支版本把操作审计写成 `session.role`（「切换身份查看」的临时视角角色），管理员以部长视角浏览时做的操作在审计里记成了部长；合并版（f1d9d5c）起所有写路径固定记录 `session.realRole`，本次迁移再把那段窗口里已经写错的历史行改成真实角色——只改「同一次 `session.view-as.start`（`metadata.role` = 被模拟角色）到对应 stop（无 stop 按视角 cookie 12 小时封顶）之间、`actor_role` 恰等于被模拟角色」的行，靠真实角色不可能写出这些行；修正值取该窗口 start 行记录的真实角色，没有 start/stop 记录的数据不会被触碰。
- **取消报名后审计只剩 "user_flow"**（`lib/operation-audit-list.ts`）：取消报名会物理删除 `user_flow` 行，列表联表取不到流程名，资源列直接退化成资源类型。现在资源标签回退到审计元数据——优先 `metadata.flowTitle` 快照，其次按 `metadata.flowId` 反查流程标题，显示为「考生流程：<流程名>（报名已取消）」，`integration/audit-log-labels.integration.test.ts` 覆盖；查询对象（`targetUser`）照旧从元数据解析。
- **「未命名操作」补齐中文名**（`components/audit/audit-log-table.tsx`、`lib/operation-audit-list.ts`）：`flow.update_workspace`、`flow.office_round_one.close`、`flow.office_round_two.close`、`department.user_flow.backfill`、`user_flow.interview_slot.request/review/update`、`user_flow.office_final_destination.set`、`session.view-as.start/stop`、`demo.seed` 补上标签并纳入快捷筛选分组；身份切换记录的元数据同时中文化（「查看身份：部长 · 部门：科宣部」，不再显示 `role：3`）。

#### 面评审批

- **已归档的通过/不通过结果在流程发布前无法改判**（`action/user-flow/evaluation.ts`、`components/manage/approvalsContent.tsx`）：审批页「已归档」里的「改为通过 / 改为不通过」按钮此前点了必然报「该候选人结果已确认，不能再修改」——`approveEvaluation` / `rejectEvaluation` 的终态锁把 `passed`/`failed` 一律挡住，而这两个状态正是第一次终审自己写下的（生产 Sentry：`role 4` 在 `/dashboard/approvals` 上 `approve-evaluation` 报错）。现在终态锁只保留「已撤回」（防止把撤回的报名复活），已通过/不通过的结果只要流程还没发布（发布中/已发布由 `moveUserFlowInTx` 锁定）就能互相改判，面评状态与候选人状态一起翻转并写操作审计；操作失败时前端直接显示服务端消息，不再只给一句「操作失败」。`integration/evaluation-result-flip.integration.test.ts` 覆盖改判、发布锁定与撤回拦截。

#### 面试 / 笔试工作台

- **讲师看不到笔试候选人的 QQ**（`components/recruitment/table.tsx`、`action/user-flow/user-point/calScore.ts`）：QQ 被两处 `role >= 3` 同时挡住——服务端 `calScore` 取用户资料时按 `canViewSensitiveInfo: role >= 3` 拉取（讲师拿到的 `qq` 直接是 null），客户端又对 `role < 3` 过滤掉 QQ 列。讲师正是要按 QQ 拉笔试群/联系候选人的角色（成员目录的口径也一直是 QQ role ≥ 2、手机号 role ≥ 3）。现在 `lib/link/people-user.ts` 把敏感字段拆成 `canViewPhone` / `canViewQq` 两个开关（`lib/link/user-lookup.ts` 的 `LookupOptions` 新增 `canViewQq`，缺省跟随原开关），`calScore` 用 `canViewQq: session.role >= 2`，QQ 列对 `role >= 2` 显示；手机号仍只在部长及以上下发（`e2e/recruitment-workspace-visibility.spec.ts` 覆盖）。
- **面试 / 笔试工作台逐行重复「投递部门」**（`components/recruitment/recruitmentContent.tsx`、`components/recruitment/columns.tsx`、`components/recruitment/evaluationTable.tsx`）：流程已经按部门拆分后，部门自有流程的每个候选人都是同一个部门（页签与流程名已经写了），再挂一列/一行只会是噪音。现在只在「投递部门」没被流程归属隐含时才显示——`showsAppliedDepartment(rows, flowDepartment)`：所有行都与流程归属一致就不显示；共享流程（流程无归属）或候选人与流程归属不一致（未归属记录、组别映射指向别处）时照旧显示。

#### 部门管理控制台

- **未归属报名记录不会跟随流程归属**（`action/department/manage.ts`、`components/department/user-flow-department-table.tsx`）：`user_flow.department` 只在报名（与改投递组别）时按「组别映射 → 流程归属」固化，而 `0060` 迁移之前的存量报名全是 `NULL`——上线后管理员面对 600+ 条「未归属」，流程早已分配好却只能一条条手改。现在两处收口：管理员在流程归属里改动流程部门时，本流程仍未归属的报名记录按报名时的同一口径（`resolveUserFlowDepartment`）**自动跟随**；「报名记录归属」页新增**「按流程归属回填」**按钮，一次性把存量未归属记录补齐（组别映射优先，手动纠正过的行不动，解析不出的——流程自己也没归属——保持未归属并回填后提示剩余条数）。回填写操作审计（`department.user_flow.backfill`），流程归属审计里带 `backfilledUserFlows`。
- **流程归属下拉只剩「全局」+「手填新部门」，部门概览一条不列**（`action/department/manage.ts`、`components/department/department-overview-table.tsx`）：下拉候选与概览行都只从库里的 `flow.department` / `user_flow.department` / 组别映射值派生，而刚上线时这些列全是 `NULL`，于是管理员打开 `/dashboard/departments` 一个部门都看不到，也没法直接选部门（只能手敲标识）。现在改为「Link 部门目录 ∪ 库中已有标识」——目录里的部门即使 0 条数据也占一行、也能直接选到，历史/未知标识继续保留；合并逻辑抽到 `const/department.ts` 的 `mergeDepartmentKeys`，邮件模板的部门下拉改用同一份实现（`integration/department-manage.integration.test.ts`、`e2e/department-console.spec.ts` 覆盖）。

#### 邮件模板「填了不生效」修复

- **办公类一面结果通知整批带着「[同学姓名]」占位符发出**（`lib/email-center/batch.ts`、`emails/offer.tsx`）：`createOfficeRoundOneEmailBatch` 给渲染传了 `genericGreeting: true`，`OfferEmail` 的称呼因此固定成字面的「亲爱的[同学姓名]同学，」——预览弹窗写着「真实发送时会替换为收件人姓名」，真实发送却把占位符原样发给了每一位候选人。现在称呼只按收件人真实姓名渲染（`genericGreeting` 机制整体移除）：两个批次创建入口（`createResultEmailBatch` / `createOfficeRoundOneEmailBatch`）在 Link 缺姓名时直接拦下并报「缺少姓名，无法发送实名通知：Link 用户 #…」，不再回落到「同学」这类非真实称呼；「测试发送」同样读真实姓名（面试通知的面试官用当前账号姓名，不再固定「李四」）；模板样张与流程发送预览也改用真实姓名渲染（样张取当前账号的姓名，不再额外查 Link），样张说明文案同步更新；发送环节新增哨兵（`lib/email-center/delivery.ts`）——投递内容里仍有「[同学姓名]」占位符时直接阻止发送并把原因写进投递记录，占位符永远出不了网；升级前已产生的占位符快照会在下一次发送（队列 / 自动重试 / 手动重试）时按收件人真实姓名重建并写回投递行，不会因为重试永远拿到旧快照而卡死。
- **测试发送 / 模板预览把 QQ 群号写死成示例值**：`action/email/test-send.ts` 与 `action/email/template.ts` 的 `getResultEmailPreviews` 都传 `groupNumber: "123456789"`，所以填了群号后在测试邮件和预览里永远看不到自己的值（真实发送路径取的是落库值，两个「预览」面彼此还不一致）。现在两处都取解析后的模板设置；「测试发送」的渲染请求构造抽到 `lib/email-center/test-render.ts`，与真实发送共用同一份解析结果并有单测守着。
- **面试 / 退回通知的邮件标题渲染示例变量**：`renderInterviewScheduleEmailSubject` / `renderInterviewWithdrawalEmailSubject` 把 `{candidateName}` 固定成「同学」、`{organizerName}` 固定成「李四」、时间与理由为空，标题里写了这些变量的模板在真实邮件里永远是样例。现在标题与正文共用同一套真实变量（`lib/email/interview-schedule.tsx`、`lib/email-center/interview-withdrawal.tsx`、`lib/email-center/render.ts`）。
- **「表单按钮文案」（`memberFormLabel`）是死字段**：可编辑、必填、会落库、也传给了邮件组件，但 `emails/offer.tsx` 把它解构成 `_memberFormLabel` 并忽略，按钮文案写死「点击填写信息表」，改了什么都不会变。现在按钮直接渲染该字段；内置默认同步改为「点击填写信息表」，迁移 `0068` 把仍是旧默认值「成员信息收集表」的行改写为新文案，已发出的邮件文案保持不变。
- **重试邮件批次会篡改报名状态**（`lib/email-center/batch.ts`）：`sendEmailBatchById` 过去默认把收件人的 `progress_status` 写成 `passed` / `failed`，而邮件中心的「重试」按钮走的就是默认值——重试一个失败的**一面通过通知**批次时，仍在二面的候选人会被提前标成 `passed`，从此不出现在二面名单里、也无法在二面被拒绝（`closeOfficeRoundTwo` 只找 `ongoing` + `round 2`），最终结果发布还会把他们算成通过并同步身份。现在重发只处理投递状态，绝不写报名状态（最终结果批次的收件人建批次时就已经是最终状态，本就不需要再写）。
- 模板编辑器补上准确的可用变量说明：结果模板的标题只支持 `{name}`/`{flowName}`/`{department}`/`{groupNumber}`，正文支持全部字段；面试模板的标题与正文都支持 `{candidateName}`/`{flowName}`/`{organizerName}` 等，避免再次出现「填了不生效」的误解。

- 邮件中心「测试发送」默认模板：此前无论选中哪个流程，默认都会用**技术招新通过模板**（`recruitment.result.accepted`）发测试邮件，办公部门看起来像技术部门招新邮件；现在默认跟随当前流程类型（办公类 → 办公类一面通过模板、免试 → 免试模板、WOC/SOC 各自模板），模板下拉按「结果通知 / 面试通知」分组，弹窗同时显示当前流程名。
- `pnpm dev:local` 现在会在启动前收掉上次留下的开发环境实例：运行态文件（`tmp/dev-all.pid`：父进程 + 已启动子进程）与端口占用双重检测，只关闭本仓库的进程（Windows `taskkill /T`，POSIX `SIGTERM`），并容忍本项目 `inngest-dev` 容器占用 8288/8289
- `pnpm dev:local` 不再依赖 PATH 上的 `pnpm`：容器用 `docker compose` 直接管理，Next.js 与邮件预览用仓库内二进制（`node_modules/next/dist/bin/next`、`node_modules/react-email/dist/cli/index.mjs`）启动
- 邮件预览服务现在能真正启动：`@react-email/ui` 与 `react-email` 固定为同一版本（6.11.0），此前版本不一致会让 `email dev` 交互式提问后静默退出
- 导航与页面权限对齐：平台级入口「反馈记录」「错误日志」只对管理员展示（此前普通账号点进去会被重定向回我的资料页）；部门级入口（试卷批改/用户管理/笔试/面试/邮件中心/流程管理/面评审批/操作审计）对无部门归属的账号隐藏，避免进入后被重定向或看到空数据
- 修复邮件模板部门化后 `pnpm db:seed:demo` 失败：模板表唯一键已改为 `(template_key, coalesce(department, ''))`，种子数据的冲突目标同步更新

#### 代码评审（PR #250）修复

- **办公类最终去向/第一志愿在发布同步里失效**：`syncUserIdentityFromAcceptedFlows` 组装的解析入参漏了 `flowType` / `choice` / `finalDepartment`，导致 `resolveLatestPassedDepartments` 的办公类分支从不生效——候选人通过多个办公部门时归属退化成「最后发布的部门」，部长团设置的 `final_department` 也传不到 Link。现已一并传入（`action/user-flow/roleTransition.test.ts` 覆盖）。
- **同一部长二面打分覆盖一面记录**：办公类「自己那份面评」的查询未按 `round` 过滤，二面提交会改写一面那一行并把 `round` 改成 2，一面均分与「全部面试记录」随之丢失。现按候选人当前轮次查找（`action/user-flow/evaluation.ts`）。
- **名单确认加锁并条件更新**（`action/user-flow/office-rounds.ts`）：结束一面/二面改为单事务「`pg_advisory_xact_lock(flow_id)` → 复查名单 → 带 `progress_status`/`round` 条件更新 → 留档快照」，两个部长同时确认或候选人恰好在撤回时不会再出现「后提交覆盖前提交」「撤回者被复活」；并调用 `assertFlowResultsEditable`，结果已发布/正在发布的流程不能再改名单与结果（错误以结构化消息返回，不炸到界面）。
- **邮件模板列表不再接受客户端传入的 scope**：`listEmailTemplateSettings` 的 `scope` 参数是客户端可控的 server action 入参，role ≥ 3 可传 `{kind:"all"}` 读到任意部门模板行（含他部门的飞书群链接/QQ 群号/联系邮箱）与虚假的 `editable` 标记；现一律由会话推导（`action/email/template.ts`）。
- **邮件批次/投递列表按行级部门严格收敛**：此前用 `visibleFlowPredicate`，只要本部门在某个「全局流程」（`department IS NULL`）里有一条报名，就能看到该流程**全部**投递的收件地址与邮件正文。现新增 `strictlyVisibleFlowPredicate` / `scopedResolvedFlowIdCondition`（`lib/flow-access.ts`），批次列表、投递列表与流程选择器都改为严格归属部门（`action/email/list.ts`、`action/email/workspace.ts`），与重试路径的 `assertFlowEditable` 口径一致。
- **`action/user-flow/roleTransition.ts` 不再是 server action**：改为 `server-only` 内部模块，入口（`syncUserIdentityFromAcceptedFlows`）再做一次部长级校验，避免两个「批量改 Link 角色/部门」的函数被当作公开 action 调用。
- **流程归属变更纳入同一护栏**（`action/flow/type-change.ts`）：语义类型里多个组合（如办公类四个部门）`type` 相同、只有部门不同，改归属不触发任何校验会让老候选人在新老部门两边都看不见；现在与改类型一样——仅管理员可改、已有报名记录则拒绝。
- **迁移 `0066` 不再可能中断整批迁移**：派生的部门流程标题加 `left(...,100)` 截断（`flow.title` 是 `varchar(100)`，超长会让 INSERT 报错并回滚 0060–0067）；共享流程改为**仅在没有剩余报名记录时**才归档，部门为空/未生成流程的报名不再挂在已归档流程上消失；同时把历史办公类报名缺失的 `round` 补为 1（名单确认按「进行中 + 当前轮次」取待确认候选人，缺轮次会永远无法确认、也无法结束）。
- **身份回源不再只靠 dashboard 渲染**（`lib/identity-refresh.ts` + `lib/dal.ts`）：`syncCurrentSessionIdentity` 过去只在 dashboard 根布局触发且被 5 分钟 TTL 挡住，只走 server action / API 的会话会一直持有旧角色与旧部门（被降权的管理员仍以 role 4 授权）。现在 `verifySession` 会在会话身份超过 5 分钟未同步时回源一次 Link 资料（失败只记日志，不把请求打成 500）。
- **`view_as` cookie 随登出清理**（`lib/session.ts`、`app/api/auth/logout/route.ts`）：此前只删会话 cookie，管理员登出后 12 小时内换人登录会继承上一个管理员的临时视角。
- **审计角色记录真实身份**：view-as 生效时各写路径的操作审计曾记录被模拟的角色（`actorRole: session.role`），与实际操作人（管理员 uid）自相矛盾；现统一记录 `realRole`（`action/**` 共 33 处），与 `session.view-as.*` 审计口径一致。
- **列表状态与文案**：办公类按面试时段筛选在切换流程时重置（此前残留旧时段会让列表静默空掉）；切换流程类型不再复用上一类型保存的步骤文案（办公类第 2 步「一面」不再写进免试/WOC/SOC 的「讲师审核」步骤）；一面不通过邮件的批次名改回「一面不通过通知」。
- **`pnpm dev:local` 只关闭本仓库进程**：`isRepoProcess` 去掉「命令行里出现 node/npm/next」的兜底（会 `taskkill` 掉占用 3001/3002/8288/8289 的无关进程），只认命令行指向本仓库目录或 `dev-all.mjs` 的进程。
- **阅卷成绩列表不再跨部门下发题目**（`action/user-flow/user-point/calScore.ts`）：问题库查询只按 `flowId` 过滤，讲师用其他部门（或未归属全局）流程的 id 调用 `calScore` 就能拿到该流程的题目与分值；现先按 `isFlowVisibleToScope` 过滤，不在可见范围直接返回空列表，与 `useProblems` / `useStepWithProblem` 同一读路径口径（`integration/review-access.integration.test.ts` 覆盖）。
- **阅卷入口要求讲师及以上**（`action/user-flow/find.ts`）：`/api/user-flow` 此前只校验登录，任何角色的部员都能用学号在本部门范围内定位候选人并读到报名状态；现改为 `verifyScopedRole(2)`，与阅卷页 `layout.tsx` 的角色门槛一致。
- **办公类「最终去向」只能指向未落选的志愿部门**：写入侧拒绝已落选/已撤回的部门（`action/user-flow/office-final-destination.ts`），名单弹窗也不再列出这些志愿（`action/flow/result-publication.ts`）；解析侧再加一道防线——评议值只有在候选人确有该部门已通过记录时才生效（`lib/flow-result-department.ts`），避免预设后该部门落选仍把成员归到未通过的部门。没有第一志愿通过时改为取「最后一次通过」的办公部门（原先按查询返回顺序取第一条）。
- **「全部面试记录」的名单确认结论不再被后一次确认清空**（`action/user-flow/office-record.ts`）：撤回后重新报名会再次结束同一轮，新审计快照只含新候选人；现按最新优先逐条审计查找该候选人的快照，早前确认结论仍能带出。
- **邮件中心模板覆盖状态提示随 UI 重做更新**（`e2e/email-center.spec.ts`）：卡片徽章已从「尚未覆盖/已有独立覆盖」改为生效来源口径（本部门覆盖 / 全局默认），写入目标提示移入编辑弹窗，E2E 断言同步更新。
- **API 路由错误码与错误信息**（`lib/api-error.ts`、`lib/access-error.ts`、`lib/dal.ts`、`lib/authz.ts`）：`app/api/**` 过去把未登录（`verifySession` 的登录跳转）与角色/部门不足一律吞成 500，`result-export` 更是把所有错误都映成 403 并回显内部 `error.message`。现在未登录 → 401「未登录或会话已失效」，角色/部门不足（`ForbiddenError` / `DepartmentAccessError`）→ 403 且只回显权限文案，其他内部错误 → 500 统一文案（不回显内部信息）；飞书绑定回调改为把登录跳转原样抛出，不再变成「绑定失败」提示。
- **Playwright 测试会话在生产环境不可达**（`app/api/test/session/route.ts`）：`PLAYWRIGHT_TEST_MODE=1` 时任意匿名者可铸造任意 uid/role 的会话；现在同时要求 `NODE_ENV !== "production"`。
- **Inngest 生产环境强制签名校验**（`queue/client.ts`）：签名校验只在 cloud 模式生效，部署时误设 `INNGEST_DEV` 会让队列端点（可发邮件、改数据）对匿名请求开放；生产固定 `isDev: false`，缺签名 key 时请求被拒（fail-closed）。
- **名单确认留档与名单写入同事务**（`action/user-flow/office-rounds.ts`、`lib/operation-audit.ts`）：留档原写在事务外且 `writeOperationAudit` 吞异常，留档失败时名单已提交、重试又因「无待确认候选人」跳过留档，导致「全部面试记录」永久缺快照。现在留档在同一事务内写入（`writeOperationAudit(input, { executor: tx })` 会向上抛错），任何一步失败整体回滚，重试可补齐。
- **办公类改时段护栏**（`action/user-flow/interview-slot.ts`、`components/recruitment/evaluationTable.tsx`）：非字符串入参（含 `undefined`）过去被强转成空串静默清空候选人的时段，现在直接拒绝；报名已结束（通过/未通过/已退回）的候选人不能再改时段，行内下拉对这些行也改为只读展示。
- **最终去向保存不再被 Link 同步失败连坐**（`action/user-flow/office-final-destination.ts`、`components/recruitment/ResultPublicationPanel.tsx`）：写入成功后立即同步成员身份，Link 不可用时过去会抛错让部长以为没保存；现在返回 `syncWarning`，界面提示「已保存但同步失败」，重试同步幂等。
- `docs/department-access-control.md` 加入 `.gitignore` 例外（此前被 `docs/*` 忽略却已被 README/CHANGELOG 链接），并修正其中过期的迁移清单与 `hooks/useFlowList.ts` 说明。

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
