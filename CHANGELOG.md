# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Fixed

- **收集表**：「恢复收集」不再在截止时间已过时假装成功（按钮禁用并提示先延长截止时间，服务端同样拒绝）；「复制表单」先弹确认并沿用原表的开始/截止时间，不再在无提示的情况下立刻放出一张没有截止时间的副本；删除自建模板会一并清空收集项并先弹确认，不再出现「空白收集表」却带着被删模板字段；年月选择器只显示已提交的年月，翻年未选月不会再显示一个不会保存的年份；批量邀请换了筛选条件后会提示「其中 N 人不在当前筛选结果中」并可一键清空；多选 / 评分 / 年月的必填项在前端先行拦截；填写记录列表标出「已退回」；评分 / 单选 / 多选与开始、截止时间补上可访问名称，时间分段输入不完整时禁止提交并说明原因。
- **邮件模板**：上标 / 下标不再在保存与发送时被清洗器静默剥掉；「成品预览」会带上尚未保存的主副标题与「字段」值（结果模板与面试模板），预览失败会提示而不是继续显示旧样张；只读浏览其他部门时「外观与主题色 / 字段」面板与画布内文都不再可编辑，不会被误判成「有未保存的改动」；面试模板的变量提示改为按注册表渲染，不再宣传该模板不支持的变量；结果模板字段提示补上 `{name}`。
- **邮件发送**：确认弹窗只把 sent / sending 标成「已发送」，待重试的收件人保持可勾选并标注「将重试」，与「将发送 N 人」的口径一致；页签切换保留 `department` 等查询状态。
- **面试与阅卷**：取消报名后列表立即刷新（修正错误的 revalidate 路径）；切换流程加载期间隐藏上一份名单的「结束一面 / 导出一面名单」，避免用旧名单误操作；没有结束时间的流程不再显示「Invalid Date」；办公类均分统一保留一位小数；未选题目时不能保存阅卷范围，且范围失效提示不再在渲染阶段触发其他组件更新；讲师账号不再看到只能由部长操作的办公类面试流程入口，无流程时说明原因。
- **签到叫号**：无办公部门 / 加载中不再显示「本轮候选人都已签到」，删除面试位需确认，轮次切换同步到 URL，扫码成功后关闭结果弹窗会自动继续扫描，二维码无效的提示改为可执行的「重新开启摄像头」。
- **其他**：新增 `/dashboard/checkin` 路由级加载骨架；`.playwright-cli/` 加入忽略；修正 `lib/timezone.ts` 的类型别名未使用告警。

### Changed

- **界面质感统一**（不含登录页）：语义色全面收敛到主题 token——散落的 Tailwind 原生调色板色（amber/sky/emerald/violet/orange/green/blue/red）迁移到 `warning` / `chart-2` / `chart-4` / `chart-5` / `success` / `primary` / `destructive`，并新增 `--warning-foreground`（文本级警告色，浅色 oklch 0.55/深色 0.8，替代对比度不足的亮金色文本）；「切换身份」提示条、收集表退回/邀请、面评审批、结果发布、签到叫号与等候大屏、阅卷与扫码等全部改用 token。
- **表格**：表头去色块改为细线分隔（表头线深于行线形成层级），表头标签加宽字距、数字列 `tabular-nums` 等宽对齐；Tabs 分段控件底色改纯色 `bg-muted`（含轮次切换、收集表步骤、签到叫号等自绘分段控件同步统一）。
- **侧边导航**：激活项增加 3px 主色圆角指示条；**加载态**由居中转圈改为镜像页头结构的骨架屏；标题统一 `tracking-tight` 与 `text-wrap: balance`；浅色模式次要文字加深（`--muted-foreground` 0.505→0.47）提升可读性。
- **修复笔试/面试管理表格工具栏吸顶冲突**：原 `sticky top-0` 会钻到全局顶栏（`z-30`、64px）底下，在移动端表现为筛选区/批量操作区上半截被顶栏盖住、两层叠在一起；现与面试表格策略统一——移动端不吸顶（约 150px 的堆叠工具栏整程吸顶会吃掉五分之一视口），桌面端 `lg:top-16` 吸在顶栏正下方。

### Added

- **收集表增强**：新增「成员信息收集表 / 空白收集表」模板与自建模板（迁移 `0083_collection_templates.sql`）：创建/编辑时可选模板、切换模板、直接修改全部字段、把当前字段另存为模板（同名覆盖）或删除自建模板；历史成员表的固定字段会并入动态收集项，旧提交同步回填到答案。班级校验为「大写字母 + 6 位数字」（如 `B240101`），学号前缀后的两位数字自动推算入学年份，班级前缀年份按默认学制 4 年推算毕业年份（如学号 `B24150524` → 2024 入学，班级 `B250607` → 2029 毕业；没有班级时回退到入学年份 + 4，均可手动修改）；邀请不再限制单次 50 人，已填写过的人也可以收到邀请（邮件会提示可忽略），邀请邮件统一走邮件中心投递记录（`collection.invitation`）；填写情况新增「退回」，可附说明并通知填写人修改后重新提交（`collection.return`，重新提交后自动清除退回标记）。
- **成员信息收集表**（`/dashboard/collection`）：部长及以上可新建、编辑、复制、删除、结束/恢复收集，并查看全部填写情况（管理员同权，不按部门或发起人拆分）。社团名称固定为南京邮电大学大学生科学技术协会；姓名/学号/学院自动从 SAST Link 带入（可修改），出生年月使用年/月选择器，政治面貌使用下拉选择；发起人可追加自定义收集项（单行/多行文本、数字、下拉单选、单选按钮、多选、日期、日期时间、时间、邮箱、链接、手机号、1-5 星评分，可设选项、必填、填写提示与上下排序，可指定从 Link 自动带入姓名、学号、学院、专业、邮箱、QQ）。填写范围可同时按身份（直接勾选新同学/部员/讲师/部长/管理员）与流程（仅所选流程最终通过者）限定；可设置开始与截止时间，到点自动开放/停止接收。每张表生成随机码分享链接 `/collect/<token>`（不使用表单数字 ID），未登录时登录后自动回到该表；邀请功能支持按流程、届别、姓名/学号/手机号批量筛选成员，勾选后可选发送邀请邮件。邀请邮件模板纳入邮件中心「模板管理 → 收集表通知」（`collection.invitation`，全局模板，管理员可编辑，不包含邀请人姓名）。填写情况支持搜索、单条删除与 CSV 导出。
  - 数据：新表 `collection_form`（`extra_fields`、`allowed_roles`、`allowed_flow_ids`、`starts_at`、`deadline`、唯一 `share_token`）/ `collection_submission`（`extra_answers`）/ `collection_invitation`（邀请与邮件状态），迁移 `0081_collection_forms.sql`；每人每表一条提交，按 `(fk_form_id, fk_user_id)` upsert，提交时保存部门快照（仅作导出信息，不参与权限）。
  - 权限：`lib/collection-access.ts`（身份与流程条件同时满足；空列表 = 不限制对应条件；部长及以上可管理并查看全部结果；填写过的人即使后续收紧条件仍能查看自己的记录）。
  - 时间：`lib/collection-status.ts` 统一计算 `未开始 / 收集中 / 已结束`，开始前与结束后都只读；延长截止时间即可恢复填写。
  - 邀请：`action/collection-invite.ts` 支持按流程、届别、姓名/学号/手机号筛选，批量勾选后可选发送邮件；邀请邮件为纯函数模板 `lib/collection/invitation-email.ts`，逐人记录 `sent` / `failed`/`pending` 状态并写审计。邮件文案在 `/dashboard/emails?tab=templates` 的「收集表通知」中维护（`collection.invitation`，全局模板，仅管理员可编辑）。
  - 登录回跳：`lib/login-next.ts` 只接受站内路径；mock 登录直接跳转，真实 Link OAuth 通过 `login_next` cookie 回跳，挡住开放重定向。
  - 入口：导航「信息收集」（我的分组，所有登录用户可见，表单列表按身份与流程过滤）；详情页右侧管理面板提供复制分享链接、编辑、复制表单、结束/恢复、导出数据、批量邀请与删除；填写情况单独成表，支持搜索与单条删除。
- **阅卷公平性分析**（`/dashboard/review/analytics`，部长及以上，部门 scope 内）：把「讲师宽严」从「考生水平 + 题目难度」里分离出来，供人工参考（**不写回 `user_point`、不影响官方成绩与结果发布**）。模型规范见 [docs/GRADING_FAIRNESS_MODEL.md](docs/GRADING_FAIRNESS_MODEL.md)。
  - 模型：单题得分率上的三因子加法固定效应 `r = μ + α(考生) + β(题目) + γ(讲师) + ε`，`lib/grading-fairness/{matrix,model}.ts` 为纯函数（零依赖、可单测）；按 (考生, 题目, 讲师) 关联图的**连通分量**分别拟合，**可辨识性按讲师级判定**：`γ_j − γ_k` 可估 ⟺ 差向量与设计矩阵零空间正交（`nullSpaceBasis` + 容差 `1e-7`），不再要求分量满秩。该关系可传递，于是划分出**可比簇**（`clusterIndex` / `clusterCount` / `comparableJudgerCount`）——只有同簇讲师才互相比较、互相居中，**孤立讲师（考生没被别的讲师评过）只让自己不可判定，不再牵连同分量的其他人**。秩亏时只给一个有界解画残差图（岭解不进宽严/标准误/收缩/校正），不可判定的讲师一律 `rawBias=0`、`bias=0`、`standardError=null`、`verdict="unknown"`、不校正。
  - 估计与收缩：正规方程 + 部分主元 LU（秩容差 `1e-9·max diag`）；**居中与标准误都改成簇内口径**——`δ_j = γ̂_j − Σ_{k∈簇}(n_k/N_簇)·γ̂_k`、`s_j = σ̂·√(c_jᵀA⁻¹c_j)`，对比向量先投影到可估子空间（抹掉零空间分量）再回代，一次分解多次回代。DerSimonian–Laird 估计讲师间真实差异 τ，**在全部可比讲师上合并估计**（一个簇常只有 2~3 名讲师，逐簇矩估计噪声过大，这是有意的简化）；可信度 `w = τ²/(τ²+s_j²)`、`bias(j) = w·δ_j`（小样本讲师自动回归 0）。τ²=0 是一个有效结论（显示「未检测到系统性差异」，λ 失效），不允许强行放大；**没有任何可比讲师时 `betweenJudgerSd = 0` 是假零**（不是「大家一样严」，而是根本没有估计），界面按「不可判定」呈现。
  - 校正语义：`r′ = clip(r − λ·m_j·bias(j) + λ·O, 0, 1)`，**统一偏移改成按题目满分加权** `O = Σ_j m_j·bias(j)·M_j / Σ_j M_j`（`M_j` = 该讲师观测的题目满分之和，输出字段 `maxPointsSum`）——原始分是 `y = M·r`，按观测条数加权只守恒「得分率之和」，各题满分不同时整届总分能漂 20+ 分。λ 为全局强度、m_j 为人工权重（0..2）、可信度由数据给出不可手改。不变量：整届**原始总分**守恒（仅受整数舍入与截断影响）、同一讲师内部保序（跨讲师的名次翻转是校正的目的，文档写清了前提与反例）、λ=0 逐点恒等（`adjustedPoints === points`，`y > M` 时原始分与校正分都等于满分）、τ²=0 恒等；`preserveTotal` 可关掉统一偏移。`verdict`（收缩前 δ 与 s 的 95% 区间）与 `credibility`/`bias`（收缩后的校正量）是**两个不同问题**：τ²=0 时可能出现「个体显著、总体无异质性证据」，界面注解「判定 ≠ 校正」且不做任何校正。
  - 页面：页头 = 标题独占一行 + 当前流程名/规模 + 流程下拉选择器（`flowPicker`，写 `?flowId=`）；正文自上而下「结论条（图标 + 粗体标题 + 说明）→ 固定 6 格指标行 → 讲师宽严（森林图 + 色例 + 校正前后哑铃图，两栏等高，右栏为一行一名讲师的校正参数）→ 名次变化（整宽，带筛选/导出）→ 诊断（残差热力图 1/2 + 口径说明 1/2）」，另有路由级加载骨架。森林图行尾给出宽严数值/判定/样本数（不可判定行画空心虚线点），哑铃图行尾给出差值；λ 与人工权重在客户端 `O(N)` 即时重算（带「不校正/半量/全量」快捷档与未保存改动提示），拟合只在服务端算一次。森林图、哑铃图与参数面板**按可比簇分组呈现**（组数 > 1 时插入分隔标签「阅卷组 N · n 名讲师 · 仅组内可比」/「不可判定 · 没有其他讲师评过同一名考生或同一道题」，孤立讲师单独一段排最后）；热力图格子是该讲师 × 该题**全部观测的标准化残差均值**，`<title>` 带样本数（`+1.2σ · n=3`）；τ²=0 而个别讲师仍带 lenient/strict 标签时，结论条与行内都注解「总体异质性证据不足，不做任何校正」。**按生产规模设计**（十几名讲师 × 十几题 × 300+ 考生）：名次表默认只渲染前 50 名、可切「全部 / 仅名次变化」并一键显示全部，可导出当前视图的 CSV；结论条只列偏离最大的 3 名讲师（只数 `credibility > 0` 的）。**没有任何可比讲师时**森林图 / 哑铃图 / λ + 人工权重 / 保存按钮都不渲染、改用「讲师阅卷量（描述性，仅供参考）」表（残差热力图与名次表照常渲染并与它并存，名次此时恒等），指标行的 τ 显示 `—`；窄屏用横向滚动保持字号，图与表都不压缩（含 `overflow-x-auto` 的卡片加 `min-w-0`，避免 flex 子项把整页撑出横向滚动）。新增语义色令牌 `--error/--warning/--success`（`app/globals.css`，浅色/深色各一套），并给 shadcn `Slider` 补上 `thumbAriaLabel`（无障碍名）。
  - 持久化：新表 `grading_fairness_profile`（迁移 `0080_grading_fairness_profile.sql`，每流程一行：`lambda`、`judger_weights` jsonb、`note`、`updated_by`），入口在 `action/user-flow/grading-fairness/{load,profile,errors}.ts`；读写都要部长及以上 + 部门越权校验，λ 与权重用 zod 校验。
  - 数据口径与笔试工作台 `calScore` 一致：可见性走 `isFlowVisibleToScope`（全局流程若本部门有报名也放行），观测与未归属计数再按 `user_flow.department` 过滤（全局流程里本部门部长只看本部门考生的卷子，管理员不受限）；流程列表与详情同一套口径、只统计有阅卷人的评分行。
  - 导航新增「阅卷分析」（管理分组，部长及以上，需部门归属）；演示数据把 flow 101 改成 uid 2 与 uid 11（讲师二）**共同批卷**（201/202 两名考生由两人分别评不同题 = 重叠样本），使宽严可辨识、可演示校正效果。
  - 测试：`lib/grading-fairness/*.test.ts` 41 条（精确还原宽严、朴素均值差被题目分配污染的反例、讲师级可辨识与可比簇、孤立讲师不牵连他人、多簇各自居中、不等满分下的总分守恒、保序边界、λ=0 截断、现状形态与秩亏反例不可判定、收缩方向、名次反转、退化分支）+ 图表与面板 52 条行为断言（`components/review/analytics`，4 suites：热力图 14 / 森林图 13 / 哑铃图 12 / 面板 13；覆盖簇分隔标签仅在组数 > 1 时插入、指标行「可比讲师」与无可比讲师时 τ 显示 `—`、热力图 `<title>` 的 `n=` 口径、无可比讲师时热力图/名次表与描述性表并存、λ 驱动校正、保存参数往返）+ `integration/grading-fairness-{load,profile}.integration.test.ts` 14 条（加载的部门 scope、未归属计数、软删除、全局流程只算本部门考生；配置往返、upsert 单行、跨部门与讲师拒绝、非法参数拒绝）。
- 办公类部门面试**现场签到叫号**（多部门共享，`/dashboard/checkin` + 大屏 `/checkin/board`）：
  - 新表 `interview_checkin`（迁移 `0073_interview_checkin.sql`，枚举 `interview_checkin_status_enum`）：一人一轮一条（`fk_user_flow_id, round` 唯一），记录叫号与 `waiting/called/interviewing/done/skipped/cancelled` 现场状态；与 `user_flow.progress_status`（流程结论）正交，面试结束后保留作现场留档。
  - 新表 `interview_station` + `interview_checkin.fk_station_id`（迁移 `0074_interview_stations.sql`）：每个部门可配置多个「面试位」（= 同时并行面试几人）。新增面试位必须**选部门（仅办公室/科宣部/外联部/赛事部）+ 填名称**（如「1 号位」或部长姓名），支持改名 / 暂停 / 删除；一位同时只接待一人。非办公部门的流程不能建位、不能签到。
  - **排队顺序 = 签到时间**：扫码或手动签到那一刻在「部门 × 轮次」队伍内取号（先到先叫）；号码按**部门号段**编（拼音首字母 办公室 `B001` / 科宣部 `K001` / 外联部 `W001` / 赛事部 `S001`，`DEPARTMENT_QUEUE_PREFIX`），跨部门不再重号、现场一眼对上部门；**所有写入（签到分号、自动叫号、手动叫号、过号重排）共用一把「场地 + 轮次」的 advisory xact 锁**，叫号改为锁内复核 + `status` 条件更新（行数为 0 提示刷新重试），避免并发重号、同一面试位被两人同时占、同一个人被两个部门同时叫号。
  - **过号规则**（`skip_count`，迁移 `0075`）：号码不变，**往后顺延 3 位**（相对本队伍还能被叫的人，不足则到队尾，整段队伍序号重排）；同一个人**最多自动重排一次**（`MAX_QUEUE_SKIPS = 1`），第二次过号后不再自动叫号，需要部长手动重呼或取消签到 —— 人已经走了不会被反复叫。
  - **叫号绑定「部门 + 面试位」**：部长在自己位点「叫下一位」= 取该位所属部门的等待队首；也可在队列行「叫到…」下拉里把指定候选人叫到某个空闲位。
  - **正在别的部门面试 → 自动跳过、不阻塞**：叫号直接找本部门下一位空闲候选人（队首全都在别部门面试时才提示稍后再叫），被跳过的人**保留队列位置**，面完回来优先补叫。
  - **第一志愿只做优先、不做硬挡**：第二志愿候选人的第一志愿尚未面完时，叫号会「先叫别人」；没有别人可叫时照样叫他，避免空转。
  - **一/二志愿各自排队**：同一同学的两次部门报名各有自己的号；一条面完后，另一条立即恢复可叫（队列里会标「另有 X」提示他还要面第二个部门）。扫码一次即可看到他在本轮的**全部**部门报名，可逐条签到。
  - `签到叫号` 页与大屏**都不按部门切分**，一页列全部办公部门；权限放到**所有部长**（role ≥ 3）。
  - 大屏**整屏展示、不滚动**：按部门数量自动 1–4 列平分，面试位卡片 + 紧凑等候队列（超出显示「还有 n 位」），可一键开启浏览器语音播报（部门 + 号码 + 姓名 + 面试位，避免两个部门同号混淆）。
  - 审计：签到与每次状态迁移写操作审计（`interview_checkin.create` / `interview_checkin.<status>` / `interview_station.*`）。
  - **语音播报规则**（`lib/queue-announcer.ts`）：同一号最多念 `3` 次、间隔 `5s`，人到场（状态不再是已叫号）即停；多人同时叫号**串行**播报（念完一条再念下一条，不再互相 cancel 打断），一拍多于一条合并成一句，超过 `2min` 的旧叫号不补念、待播队列上限 4 条 —— 避免「一堆人同时叫号」时语音混乱或念出一条过期长队。
  - **手机优先的现场视图**：默认选中**自己的部门**（`?dept=office` 可收藏）；手机按「现场 / 签到台」两段；**面试位与队列合并进同一个部门块**（面试位在上、该部门队列紧接在下），不再需要在「面试位/队列」之间来回切。部门块只列等待/过号/已完成，正在面试的人只在面试位卡片上出现一次。
  - **边面边写面评**（`components/recruitment/checkin/officeRecordQuickDialog.tsx`）：面试位卡片上直接「写面评」（面试中即可写，不必等结束），弹窗填分数 + 记录内容（可选面试意见），复用 `createEvaluation` / `getOfficeInterviewRecord`；已写过显示「我已记录 · n 分」。**不再跳转面试页、不再每点一次多一个标签页**（面试管理工作台那侧的「签到叫号」回跳保留）。
  - **减噪**：等待态不染色（绝大多数行都是等待）、次要动作（过号 / 取消签到）收进 `⋯`、每行两行结构（号码 + 姓名一行），修掉了手机上按钮把姓名挤成「王…」的问题。
  - **演示数据**：mock Link 新增 12 个办公类面试候选人（`uid 301-312`，`department: null`，学号 `B24xxxxxx` 与技术类演示账号区分），种子里一面在等候 办公室 8 / 科宣部 6 / 外联部 4 / 赛事部 5，另有 8 人未签到，二面若干已完成/等候 —— 可以连着点十几次「叫下一位」。
  - 导航新增「签到叫号」（业务分组，部长及以上，需部门归属）。
- 面试工作台的办公类**面试记录弹窗**补上与签到叫号同一块**「本轮已记录 n 份 · 均分 x」一览**（`components/recruitment/officeRoundSummary.tsx`，两处共用），并在弹窗描述里写明**一面/二面**：两轮在同一张列表上来回切时不会再写错轮次，写之前就能看清本轮有谁打过、打了几分、填了什么意见，不必再点开分数列的弹层；一览只取当前轮的面评，上一轮的记录不混进份数与均分。技术流程的面评弹窗不变。
- **「取消报名」只在候选人尚未进入流程时可用**（`components/userFlow/flowCard.tsx`、`action/user-flow/unregister.ts`）：提交报名时 `register` 会把当前步骤写成「报名」的下一步（`order=2`），所以「刚报名、还没被处理」（当前步骤仍在报名后的前两步内）都能取消；推进到再下一步（某个后续步骤已结束）后卡片上的取消报名按钮不再显示，服务端把「步骤校验 + 删除」放进同一事务，删除条件直接写成「当前步骤 ∈ 报名后的前两步（或未记录当前步骤）」，用受影响行数判定成功 —— 校验与删除之间不再有竞态窗口，旧页面 / 直连请求同样被挡。准入判定用持久化的 `currentStepOrder`（`activeStepOrder` 在步骤缺失时会回退，只用于展示）。
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
- 办公类「最终去向」：同一候选人通过多个办公部门时按「第一志愿优先」自动归属（`lib/flow-result-department.ts`）；部长团评议可在办公类流程的「完整名单」里逐人设置 `user_flow.final_department`，立即重新同步成员部门，避免发布顺序影响归属；评议值**当届有效**（`user_flow.final_department_decided_at`）：决策之后新创建的流程一旦产生通过记录，就回到「最后一次通过覆盖」重新裁决，避免上一届的评议值永远压过成员后来通过的部门
- 办公类面试记录只保留**分数 + 记录内容**：去掉「建议通过/建议不通过」与飞书会议/妙记链接（办公类不产生飞书会议），提交成功提示改为「面试记录已保存」。
- 办公类**取消面评审批**：办公类没有讲师这一级，结果由部长直接决定，面评提交即归档；面评审批页不再展示办公类流程，`approveEvaluation`/`rejectEvaluation`/`returnEvaluation` 对办公类直接拒绝。
- 办公类两轮改为**名单确认制**（部长操作）：结束一面 → 名单弹窗逐人确认通过/不通过（附当前记录均分与份数）→ 确认邮件模板 → 确认发送（通过者进入二面、未通过者结束流程，并发一面结果通知）；结束二面 → 同一弹窗确认最终名单（含同一人通过多个部门时的「最终去向」选择，冲突由双方部门讨论决定）→ 确认模板 → 确认发布。邮件队列不可用时名单确认仍然生效，界面提示稍后重发（已发送的通知不重复）。
- 办公类流程**确认一面后报名截止**（`flow.registration_closed_at`）：一面名单确认与报名截止同事务落库，之后报名入口把该流程置灰并标注「报名已截止」（同一时间其他流程照常可选），服务端 `register` 同样拒绝新报名——晚来的报名已经没有一面可以参加。
- 名单确认弹窗重做：宽表固定列宽、不再横向滚动，移动端卡片布局；提供「全部通过/全部不通过」与逐人切换，无面试记录的候选人会标出提示。
- **结果邮件模板正文改为「区块」编辑，并支持主题色、自定义 HTML/CSS 与可复用样式**（`lib/email/blocks.ts`、`lib/email/sanitize.ts`、`lib/email/theme.ts`、`emails/offer.tsx`、`components/email/EmailResultTemplateDialog.tsx`、`components/email/EmailBlockEditor.tsx`、`components/email/RichTextField.tsx`、迁移 `0076_email_template_blocks.sql`）：
  - 正文不再是「一段 textarea」：区块可开关 / 上移下移 / 删除，类型为**文本段落（TipTap 富文本：加粗、斜体、下划线、删除线、小标题、列表、链接、文字颜色、分隔线）**、**卡片（标题 + 有序的文本行 / 按钮行 / 分隔线行）**、**自定义 HTML/CSS**、**分隔线**；「加一个框」就是加一张卡片，「加一个按钮」就是加一行。
  - 落库到新列 `email_template_setting.body_blocks`（jsonb）。**为空 = 未自定义**，渲染时由 `defaultResultEmailBlocks()` 生成内置版式（正文取模板自己的 `body_template`，没有则取 `lib/email/result-email-copy.ts` 的内置文案），因此存量模板的渲染结果与改造前逐字一致（12 套结果邮件已逐段比对）。
  - **结构卡片与正文解耦**：报名入口（成员信息表 + 飞书群）、授课日历、内部群卡片由流程类型决定、与正文文案无关 —— 修掉了「一改正文，下面两个说明框就没了」。
  - 新增 `theme_color` 主题色：空值沿用内置的通过绿 / 不通过橙，填了就由它推导顶部色条、结果面板、徽章、描边与主题色按钮（`lib/email/theme.ts`）。
  - 自定义 HTML/CSS 与富文本产物在**保存时**与**渲染时**各按邮件白名单清洗一遍（`sanitize-html`）：不允许 style/script 标签与 `on*` 事件属性，保留元素上的 `style`，并给 `a`/`ul`/`li`/`h3` 等补默认内联样式（Outlook 只认内联样式）；渲染时清洗发生在 `{变量}` 替换**之后**，避免变量值逃逸出 HTML 属性。
  - 编辑弹窗重做为「左侧字段与区块 + 右侧实时预览」，预览走 `previewResultEmailTemplateDraft`（600ms 防抖、服务端渲染，与真实发送同一条链路）；「恢复内置版式」一键回到 `defaultResultEmailBlocks()`。
  - 新增**样式预设** `email_template_style_preset`（`action/email/style-preset.ts`）：把一段自定义 HTML/CSS 存成具名样式，在任意模板里「插入样式」复用；可见范围 = 全局预设 + 本部门预设，写权限与模板口径一致（全局仅管理员，部门仅本部门），保存/删除写操作审计。
  - 内置文案（招新一族、WoC、SoC、办公类）收敛到 `lib/email/result-email-copy.ts` 一处：模板默认值与内置版式共用同一份，不再「改了组件里的默认、忘了模板设置里的默认」。
  - 依赖：新增 `sanitize-html@2.14.0`（固定小版本：2.15+ 起 htmlparser2 转 ESM，jest 无法解析）、`@tiptap/react`、`@tiptap/starter-kit`、`@tiptap/extension-text-style`、`@tiptap/pm`、`@tiptap/extension-text-align`、`@tiptap/extension-highlight`、`@tiptap/extension-image`。
- **邮件可以自己画了：区块样式、区块库、邮件外框、更自由的富文本，并且所有邮件都能改**（`lib/email/blocks.ts`、`lib/email/email-shell.tsx`、`lib/email/interview-email-blocks.ts`、`components/email/EmailBlockEditor.tsx`、`components/email/EmailFrameFields.tsx`、`emails/interview-schedule.tsx`、迁移 `0078` / `0079`）：
  - **每个区块都能覆盖样式**：内边距、外边距、背景色、文字色、描边、圆角、对齐、最大宽度、字号、字重、字体、行高、字间距；留空 = 用渲染器默认（「不填」与「填成默认值」表现一致）。颜色字段带取色器 + 手填，可写 `#RRGGBB`，也可写 `transparent` 这类 CSS 值。
  - **区块库**：「添加区块」按**文本 / 布局 / 内容 / 组件**分组 —— 文本段落、自定义 HTML/CSS、分隔线、间距、卡片、双栏、图片、按钮、结果面板、状态徽章、重要步骤卡、授课日历卡、后续活动卡、内部群卡片；新增区块类型 `image` / `button` / `spacer` / `columns`（邮件里用表格实现，Outlook 不认 flex/grid）/ `resultPanel` / `badge`。
  - **区块操作**：拖动标题栏排序（上/下移保留给键盘与测试）、复制区块、折叠/展开（含「全部收起」）、启用开关、单块「存为样式」。
  - **整封正文都是区块**：结果面板、称呼、联系与落款也变成区块，可以改样式、换位置或删掉；模板设置里的 `result_badge_template` / `result_title_template` / `result_summary_template` 退化成「未自定义版式时的种子」（`RESULT_EMAIL_PANEL_COPY` 是唯一来源，与设置默认值同源）。
  - **邮件外框可编辑**（`email_template_setting.body_frame`）：页面背景色、内容卡背景/描边/圆角/宽度、Logo 地址与宽度、页眉眉标、页脚图片与文案；留空回落内置外观。外壳与正文区块渲染抽到 `lib/email/email-shell.tsx`，结果邮件与面试通知邮件共用。
  - **富文本补厚**：H2/H3/H4、字号（12–24px）、文字高亮（6 色）、左/中/右对齐、插入图片（纯数字宽度走 `width` 属性，其余走 `style`）；清洗白名单同步放开 `h2/h4/mark/img` 与 `font-size`/`text-align`/`background-color`。
  - **面试通知邮件也切到同一套**（预约 / 改约 / 取消 / 暂不改期 / 报名退回，迁移 `0079` 给 `email_template_content` 加同样的三列）：正文由 `defaultInterviewEmailBlocks()` 提供内置版式（状态徽章 + 开头说明 + 日程卡 + 流程/地点/讲师元信息卡，退回通知是正文 + 退回理由卡），编辑器与结果模板同一套（外观 + 主题色 + 区块 + 右侧实时预览，预览走 `previewInterviewScheduleEmailTemplateDraft`）；老字段 `footer_text` 作为页脚文案的种子继续生效。
  - 结果邮件与面试邮件的外框/主题色都由模板自己维护：管理员可改全局默认与任意部门，部长改本部门、只读浏览其他部门（口径不变）。
- **邮件模板编辑器改成「所见即所得画布」**（`components/email/EmailCanvas.tsx`、`components/email/InlineEditableText.tsx`、`lib/email/email-styles.ts`）：
  - 编辑器不再是一列「标签 + 输入框」的表单：**左边那一整块就是邮件本身**（页面底色、内容卡、页眉、正文、页脚，全部用与发送时同一套内联样式，抽到 `lib/email/email-styles.ts` 由服务端渲染与浏览器画布共用）。文字点进去就能改，按钮/图片点一下弹出它自己的字段，卡片里的行就地加/删/排序，区块之间悬停出现「插入」细线可以在任意位置加内容。
  - 悬停区块左侧出现**拖动把手**与**区块菜单**（上移 / 下移 / 复制 / 隐藏 / 存成可复用样式 / 删除）与**样式浮层**（13 个样式字段，留空 = 邮件默认外观）；页眉标题、副标题、眉标、页脚文案也在画布上就地编辑，Logo 与页脚图片点一下换地址。
  - 工具栏只留非视觉动作：「插入区块 / 插入样式 / 外观与主题色 / 字段 / 成品预览 / 恢复内置版式」——「字段」放收件箱标题、联系邮箱、各链接与群号（它们被画布上的 `{变量}` 引用）。
  - 富文本格式化跟着选区走（`RichTextField` 新增 `variant="bare"` 与浮动工具条）：加粗/斜体/下划线/删除线/H2-H4/列表/引用/行内代码/文字色/高亮/字号/字体/行高/对齐/链接/上标下标/清除格式/撤销重做。
  - 「成品预览」一键切到服务端渲染的真实邮件（与真实发送同一条链路），随时核对收件箱效果。
  - **暗色主题下的可读性**（`app/globals.css` 的 `.email-canvas-theme`）：画布渲染的是浅色邮件，但画布内的占位文案、分隔线、提示用的是 Tailwind 令牌 —— 应用切到暗色时 `muted-foreground` 会变成浅灰，落在浅色卡上就「看不见」。现在画布子树重新钉回浅色令牌（弹层仍按应用主题渲染），暗色下也读得清。
  - **可发现性**：画布顶部有一条可收起的使用提示（点文字直接改 / 点按钮改字段 / 左侧 ⠿ 拖动、调色板改样式、⋯ 更多 / 选中文字浮出格式条 / 保存才落库）；区块左侧的把手常驻 35% 透明度、悬停高亮整个区块；正文末尾常驻「在结尾加一块内容」；画布上方标注「邮件正文 · 560px · 点哪里改哪里」；空正文时给可点的「加第一块内容」。
  - **画布改成单文档**（`components/email/EmailCanvas.tsx`、`@tiptap/extension-drag-handle-react`）：整篇正文是一个 TipTap 文档，每个区块是文档里的 atom 节点（NodeView 里渲染原来的区块 UI），拖拽把手、区块菜单与「插入到哪」由官方拖拽扩展统一处理 —— 自研的「每块一个 hover 工具条」删掉，不会再出现把手互相压住 / 点不到 / 悬停丢失。外部改动（撤销、套用版式、恢复内置）通过 `setContent` 同步回文档，文档自身的变化经 `onUpdate` 回到区块数组（落库与渲染完全没变）。
  - **斜杠菜单**（`components/email/RichTextField.tsx` + `@tiptap/suggestion`）：在正文里打 `/` 就唤起区块菜单（与「插入区块」同一份清单，14 项），输入关键词过滤、↑↓ 选择、回车插入到当前块后面；不要求 `/` 前面是空格，中文标点后也能唤起。菜单用原生 DOM 绘制，条目与回调存在编辑器 `storage` 里（扩展只建一次）。
  - **修掉「点了没反应」的根因**：画布上的图标按钮没有透传 props，`DropdownMenuTrigger asChild` 注入的 `onPointerDown` 等被吞掉 —— 现在 ⋯ 菜单可正常打开、删除区块、撤销恢复都可用（浏览器实测 11→10→11）。
  - **「外观与主题色」/「字段」从弹层改成对话框内的面板**：这两个 Popover 里字段很多、内容超出高度，而且 Radix 弹窗的滚动锁会把「非弹窗层」的滚轮吞掉 —— 实测滚轮完全不动（`scrollTop` 恒为 0），用户只能看到被裁掉的下半截。现在点这两个按钮会把正文区切成面板，直接在弹窗自己的滚动区里滚（实测滚轮 300px 生效），工具栏按钮显示选中态，再点一次回到画布。
  - 卡片配色从原生下拉改成**色板 + 取色器 + 自动**；卡片行的 ↑↓× 从卡片外侧移进行内右上角（原来鼠标一移出去 hover 就丢，根本点不到）。
  - **正文升级成文档内容**（`components/email/EmailCanvas.tsx`）：文本区块不再是「区块内嵌一个富文本编辑器」，而是文档里的 `emailText` 节点（`content: "inline*"`，样式/启用状态挂在节点属性上，渲染时输出与真实邮件同一套内联样式）；卡片/图片/按钮/双栏/结果面板/徽章/代码仍是 atom 节点。由此拿到：**一个模板弹窗里只有一个编辑器**（实测从 16 个 ProseMirror 降到 9 个，其余是卡片行里的富文本）、**跨区块选中文字**（实测选区可跨两段正文）、以及**整篇文字级撤销**（走同一份草稿历史）。`html → 文档 → html` 由 `email-inline-extensions.test.ts` 的往返契约守着；段落按「一个 `emailText` 节点 = 一个文本区块」切分，回车即新建一个文本区块、退格即合并。
  - 行内能力（加粗/斜体/下划线/删除线/标题/列表/引用/代码/链接/颜色/高亮/字号/字体/行高/对齐/上下标/图片）抽成 `components/email/email-inline-extensions.ts`，画布外层文档与卡片行里的富文本**共用同一套**；浮动格式条导出为 `EmailBubbleMenu`，两处共用。
  - 旧的表单式区块编辑器 `components/email/EmailBlockEditor.tsx` 删除（画布是同一份区块数据的另一种表现，落库格式与渲染完全没变）。
- **邮件模板编辑器第二轮打磨**（`components/email/EmailCanvas.tsx`、`RichTextField.tsx`、`email-variables.tsx`、`emailDevicePreview.tsx`、`EmailUnsavedChangesDialog.tsx`、两个模板弹窗）：
  - **插入位置**：区块左侧的拖动把手多了 **＋**，点开就是区块库并插到**这一块后面**（原来只有「追加到结尾」一个位置）；斜杠菜单也从「追加到整封邮件末尾」改成插到**光标所在的那一块后面**。
  - **变量不用背了**：选中文字后浮动工具条上多了 `{}`，列出当前模板真正认得的变量并按来源分组——「运行时数据」（来自模板注册表：姓名、流程名、时间、地点…）与「模板字段」（来自「字段」面板：联系邮箱、飞书群链接、日历链接…），点一下插到光标处，带 `{key}` 与示例值。
  - **样式浮层换成先给档位、再给 CSS**：对齐（左/中/右）、内边距 / 圆角 / 字号 / 字重四组预设、背景色与文字色色板（含取色器与「自动」），13 个原始 CSS 字段收进「高级 CSS（直接写样式）」。留空仍然表示「用邮件默认外观」。
  - **关窗守卫与 ⌘S**：改动先落草稿，有未保存改动时按 Esc / 点遮罩 / 点右上角关闭会先弹确认（继续编辑 / 放弃修改并关闭 / 保存并关闭），没有改动直接关；标题旁加「有未保存的改动」徽章、页脚给出「已保存 / 有未保存的改动 · ⌘/Ctrl+S 保存」，⌘/Ctrl+S 直接保存。右上角补回可见的关闭按钮（此前只能靠 Esc 或点遮罩）。
  - **只读浏览真的只读**：其他部门的覆盖此前只隐藏保存按钮，画布仍可随便改；现在正文不可编辑、拖动把手不出现、插入区块 / 插入样式 / 存为版式 / 恢复内置版式全部禁用，画布上写明「其他部门的覆盖只能查看」。
  - **成品预览加桌面 / 手机**：同一份服务端渲染的 HTML 按桌面宽度与 390px 手机宽度各看一遍（`emailDevicePreview.tsx`），邮件在手机上的换行与卡片宽度不用再靠想象。
- 办公类流程改为部长口径：候选人列表、面评提交与改期审批都要求部长（`manager`）；办公流程界面上的「讲师」文案改为「部长」。
- 办公流程面试表格按志愿口径展示：`志愿`（第一志愿/第二志愿）+ `另一志愿部门`，隐藏作品列（办公类不收集作品）。
- 流程类型名称按归属部门显示：`软件研发部WOC / 多媒体部WOD / 软件研发部SOC / 多媒体部SOD / 软件研发部免试 / 多媒体部笔试 …`（`flowTypeLabel`），流程创建下拉、面试工作台页签、流程列表与部门归属表统一使用。
- 邮件模板新增 `interview.schedule.change.rejected`（面试改期未通过通知，含驳回理由变量）。
- **管理员可给笔试「清分」**（`action/user-flow/user-point/clear.ts`、`components/recruitment/columns.tsx`、`action/user-flow/user-point/calScore.ts`）：得分组成弹窗里管理员（role 4）可逐题「清分」或「清空全部得分」——删除该题的评分记录，让题目回到**「未批卷」**（与改成 0 分不同：0 分仍被原阅卷人占用，别的讲师改不了这道题），考生总分与已批卷状态随之重算，该题任何讲师都能重新认领。清分是不可逆删除，原分数 / 备注 / 阅卷人写进操作审计（`review.score.clear`，审计列表读作「60 → 清除」并可回看是谁的评分被清掉）；**结果已确认（通过 / 不通过）或名单正在发布 / 已发布时拒绝清分**。同时得分组成弹窗里没有评分记录的题显示「未批」而不是「0/满分」——清分后的状态一眼可见。

### Changed

- **工作台视觉系统整体升级**（`app/globals.css`、`components/ui/*`、`components/dashboard-layout.tsx`、`components/app-sidebar.tsx`、`components/route.tsx`）：把原来「白底 + 灰边」的默认 shadcn 观感改成中性分层表面 + 品牌绿点缀——背景、侧栏、卡片改用不带绿调的中性灰阶，主色只用于文字、图标、实心按钮与焦点环，不再用大块绿色蒙层或渐变；圆角统一到 12/16px，卡片加 1px 接触阴影与柔和投影，弹层用统一浮层阴影；顶栏改为吸顶 + 半透明模糊并去掉内容区多余分隔线，侧栏导航改为 36px 行高、分组标签降噪、当前项用中性色块 + 绿色文字与图标；表格表头改成浅灰条与次要色标签、行悬浮改中性色；输入框/下拉/标签页/徽章/骨架屏/分页同步到同一套层级。「我的资料」页把更新时间收成胶囊、信息区块加图标标题并拉开字段节奏，流程卡片增加状态胶囊与更清晰的步骤圆点，空态与加载态一并收敛。登录页保持原样。

- **电子部启用**（`const/department.ts`、`const/flow.ts`）：从「暂不启用」清单移除 `electronics`，并把电子部加入语义化技术部门（`TECH_SEMANTIC_DEPARTMENTS`）——流程创建/编辑可选「电子部 免试 / 笔试 / 留任考核」（不提供 WOC 选项）；面试与笔试管理工作台的流程选择器/页签、流程管理列表、邮件模板的「模板归属」与阶段过滤都恢复收录电子部的流程与模板（WOC 模板同样不对电子部展示）；电子部不用 SOC/SOD 代号，SOC 阶段显示为「电子部留任考核」。存量流程、报名记录与模板数据无需迁移。
- **笔试工作台工具栏补上两个计数**（`components/recruitment/table.tsx`）：输入分数线后旁边直接显示「≥ 60 分 12 人」（按整份名单统计，与状态胶囊同一口径），划线时不用再逐行数；「已选 N 人」不再只在有选中时才出现——0 人也显示，勾选过程中随时看得到选了几个（结果已锁定时不显示，因为那时没有可勾选的）。
- **笔试「平均分」不再把未批卷的考生算进分母**（`components/recruitment/recruitmentContent.tsx`）：未批卷记录的 `totalScore` 是 `coalesce(sum(points), 0)` 出来的 0，之前照样参与平均——批卷进度一低均分就被拉低，全组都没批时还显示 0.00（看起来像全组零分）。现在只统计**已批卷**的考生，并在数字旁标出「已批卷 n 人」（分母与「总人数」不同，不写出来两个数字并排看着对不上）；一个都没批时显示「—」。
- **筛选不再跨轮次 / 跨流程残留**（`components/recruitment/evaluationTable.tsx`、`components/recruitment/table.tsx`）：此前一面选中的状态胶囊、志愿 / 时段 / 组别筛选与搜索词会跟着切到二面或另一条流程上，新列表看起来「怎么没人」；现在切轮次、切流程会清空搜索与全部筛选（笔试管理同样清空搜索、列筛选与勾选）。笔试管理的「结果已发布，名单已锁定」只在名单上方提示一次，空态也不再两句同义文案并列。
- **办公类一面名单确认也可以选择「谁不发邮件」**（`components/recruitment/officeRosterDialog.tsx`、`components/recruitment/recruitmentContent.tsx`、`action/user-flow/office-rounds.ts`、`lib/email-center/batch.ts`）：一面与二面共用同一张名单弹窗，邮件列对两面都可用——未勾选的候选人只写结果、不发通知，确认后也不会再给他们建投递；弹窗顶部提示「N 人本次不发邮件」。此前只有二面与技术流程有这一选择。
- **名单确认弹窗与名单弹窗去重**（`components/recruitment/officeRosterDialog.tsx`、`components/recruitment/officeRoundOneRosterDialog.tsx`、`components/recruitment/ResultPublicationPanel.tsx`）：弹窗描述不再重复徽章里的人数（「待确认名单（N 人）」「共 N 人」），模板核对说明压成一行、按钮不再独占一行。
- **办公类「结束一面」在名单确认后换成名单回看与导出**（`components/recruitment/recruitmentContent.tsx`、`components/recruitment/officeRoundOneRosterDialog.tsx`、`app/api/flow/office-round-one-export/route.ts`）：一面名单确认后，「结束一面并发送通知」不再出现（重复确认只剩重发通知一个用途，重发请走邮件中心），取而代之的是「查看一面名单」（进入二面 = 通过、止步一面 = 不通过，附一面得分）与「导出一面名单」（CSV，与回看同一份推导，避免两边对不上）；还没有一面候选人的流程同样不再有结束一面的入口。
- **面试记录弹窗的信息层级重排**（`components/recruitment/officeRecordDialog.tsx`、`components/recruitment/evaluationTable.tsx`）：「全部面试记录」此前每个信息块都套一层边框、每轮还带考察方式说明与整段「名单确认」说明——现在候选人身份与「志愿 / 另一志愿 / 时段 / 最终去向」压成两行摘要，轮次之间只用分隔线分区，均分并入分区标题，名单确认结论压成一行（尚未确认只留一行提示），空轮次只留一句空态，面评记录的分数右对齐、正文恢复常规字色。填写面试记录的弹窗去掉重复的「必填」「平均分」说明与单独一行的字数统计（字数移到标题行），分数上限与「面试意见（参考）」的可选性贴在标题行，并新增 Ctrl/⌘ + Enter 直接保存。
- **面试 / 笔试管理默认回到「上次使用的流程」**（`lib/workspace-flow-preference.ts`、`components/recruitment/recruitmentWorkspacePage.tsx`、`components/recruitment/recruitmentContent.tsx`）：原来每次打开都选中最新创建的流程，部长在多个流程之间来回切换后，下次进来还得重新找。现在每次切换流程都把它写进按工作台分开的 Cookie（`people_workspace_flow_interview` / `people_workspace_flow_written`，180 天），服务端首屏按「显式 flowId 链接 → 上次使用 → 最新」挑流程——不用 localStorage，避免先渲染最新流程再切换的闪动与重复请求；记忆值仍按当前会话可见的流程列表校验，越权 / 已删除的 id 自动回落最新流程。
- **办公类结果邮件的主题不再带候选人姓名**（`lib/email/template-settings.ts`、`lib/email-center/registry.ts`、`migrations/0070_office_email_subject_without_name.sql`）：内置主题曾是 `{name}{department}一轮面试结果通知`，于是邮件中心的「发送记录」与待发卡片显示成「张三办公室一轮面试结果通知」——每封投递各带不同姓名、批次却只能存一个代表性主题，看起来像整批只发给某个人，也与其他流程（「2026 春季招新 结果通知」）的读法不一致。现在内置默认改为 `{department}一轮面试结果通知` / `{department}面试结果通知`；批次级主题与流程卡片主题渲染时 `{name}` 留空（个人化只保留在正文称呼与每封投递自己的标题里），迁移 `0070` 把仍是旧默认的落库行改写过来。部门想要姓名进主题，仍可在模板里写 `{name}`。
- **「测试发送」的模板列表按部门阶段收窄**（`components/email/EmailTemplateManagementSection.tsx`）：下拉与卡片此前口径不一致——卡片已按「部门 × 阶段」过滤，测试发送下拉却是全部模板，办公部门的部长能看到笔试/免试/WOC/SOC 与飞书日程模板，容易误以为这些也要自己维护。现在下拉与卡片同一套过滤（办公部门 = 一面/二面 + 报名退回；技术部门 = 笔试/免试/WOC/SOC + 面试通知），跟随流程类型的默认键被过滤掉时回落到第一个可选项；已选中的模板被新部门过滤隐藏时同样回落到默认键，发送不会再带上下拉里已经看不见的模板。
- **面评审批卡片信息重排**（`components/manage/approvalsContent.tsx`）：姓名、学号、讲师建议与最终结果徽章现在排在同一行且徽章靠右对齐（此前姓名触发按钮是块级元素，桌面端就把学号挤到下一行；移动端学号还被 `hidden sm:inline` 隐藏），移动端同样显示学号；去掉「投递部门」一行（部门隔离下流程名本身已体现部门，投递组别保留）。
- **面评审批的归档搜索支持 QQ**（`components/manage/approvalsContent.tsx`、`action/user-flow/evaluation.ts`）：搜索框此前只匹配姓名 / 学号 / 面评人 / 审批人 / 流程名，按 QQ 找人搜不到；现在 QQ 也参与匹配（占位文案改为「搜索姓名、学号、QQ、面评人或流程」）。`getAllEvaluations` 用 `listPeopleUsersByLinkIds({ canViewQq: session.role >= 2 })` 取 QQ，阈值与成员目录一致（讲师及以上），不额外放宽敏感字段。
- **飞书绑定失败的提示改为中心弹窗**（`components/feishu-oauth-failure-dialog.tsx`、`app/dashboard/page.tsx`）：原来的右下角 toast 会被飞书授权页盖住，用户看不到「当前 Link 账号未绑定飞书身份」这类失败原因。现在失败原因固定显示在屏幕中央：Link 未绑定飞书时提供**「去 Link 绑定飞书」**（新标签页打开 `NEXT_PUBLIC_LINK_PROFILE_URL` 的 `/settings`，默认 `https://link.sast.fun/settings`）与「重新绑定飞书」，账号不匹配 / 授权中断提供「重新绑定飞书」；URL 参数清理与「刷新不再弹」的行为保持原样（`components/feishu-oauth-failure-toast.tsx` 删除）。
- 办公部门**没有讲师这一级**：切换身份查看里「讲师」只在技术部门可选（选中办公部门时禁用并提示，部门下拉标注「（无讲师）」，服务端 `startViewAs` 同样拒绝），避免切出「办公室讲师」这种不存在的身份。
- 笔试管理表格支持**表头排序**（学号 / 姓名 / 投递部门 / 状态 / 总分，默认总分从高到低，空分数固定沉底），与面试表同一套箭头与交互；面试表的「面试时段」「最终分 / 平均分」排序继续保持可用（办公类按流程配置的时段顺序排、没选时段的沉底）。
- 笔试「得分组成」弹窗补上**考生身份**（`components/recruitment/columns.tsx`）：弹窗会盖住表格里的姓名 / 学号列，此前只有一列题目明细，看不出这是谁的分；现在标题下方按「姓名（学号）」标注考生（与面评记录弹窗同一口径，学号缺失显示「无学号」）。
- 办公类候选人「全部面试记录」里的「名单确认」空态改成说明性文案（该轮还没有确认名单 → 部长结束该轮后会留档结论 / 操作人 / 确认时刻均分与份数），不再只给一句「尚无名单确认记录」。
- 面评审批工具条在窄屏重排：视图切换 + 部门筛选同一行，归档搜索整行，三个筛选下拉排成两列网格，不再互相挤压、搜索框也不会塌成一条缝（桌面端保持一行）。
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
- 面试工作台的办公类**面试记录弹窗排版对齐签到叫号的随手面评**（`components/recruitment/evaluationTable.tsx`）：分数移到最前，标签改成弱化小字并与提示同行（不再一段贴左一段贴右），分数 / 内容 / 意见三个控件一律全宽，记录内容从固定 160px 高改成 5 行可拉伸，弹窗宽度回到默认 512px；技术流程的面评弹窗保持原样（仍 `sm:max-w-xl`、讲师建议与妙记链接不变）。
- 笔试「得分组成」弹窗的**清分入口收成一个小橡皮图标**（`components/recruitment/columns.tsx`）：管理员在每道已批的题上原本挂着一个红色「清分」文字按钮，四道题就是四块红；现在只留一个小橡皮图标（平时灰、指向它才变红，`aria-label` 仍写明「清除「题目」的得分」），卡片、分数胶囊、阅卷人与评语的分块一律照旧；顶部「清空全部得分」不变。

### Fixed

- **邮件中心模板页整页打不开、面试/笔试发信失败（React #441，Sentry `SAST-PEOPLE-AA`）**（迁移 `0084_repair_email_editor_schema.sql`）：`0076` / `0078` / `0079` 所在分支在 `0080–0083` 已经上线之后才合入 `v3`。drizzle 迁移器只比较 journal 的 `when` 与库内最后一条 `__drizzle_migrations.created_at`，合并后这三个迁移的时间戳反而更小，被静默跳过，生产库因此缺少 `email_template_setting.body_blocks` / `body_frame` / `theme_color`、`email_template_content` 的同类字段以及 `email_template_style_preset` 表——模板页读到 `column "body_blocks" does not exist` 后整页服务端渲染失败（客户端只剩 React #441），发送面试/笔试邮件也连带报同样的错。新增幂等补偿迁移补齐这些列与表（`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`），可安全重复执行。
- **邮件模板页逐模板查库（Sentry N+1，441 次）与流程邮件预览逐流程查库**（`lib/email-center/template-resolution.ts`、`action/email/template.ts`、`action/email/workspace.ts`）：`getResultEmailPreviews` 对 13 个模板各执行一次 `select ... from email_template_setting where template_key = $1`，任务页的流程预览也按「流程 × 通过/不通过」重复查询。现在统一走 `loadResultEmailTemplateSettingRows` / `readResultEmailTemplateSettings` 一次取回候选行、在内存里按部门解析；模板页的查询次数从 13 次降到 1 次，流程预览从 2×N 次降到 1 次。新增/更新 `action/email/template.test.ts` 断言只查一次。
- **Link 提前撤销 access token 时被误踢回登录页**（`lib/link/session.ts`、`lib/link/user.ts`、`lib/identity-refresh.ts`，Sentry `SAST-PEOPLE-8N`）：身份回源与资料页都只在 access token 临近过期时才 refresh，Link 因角色/密码变更提前撤销 token 时会直接 401，用户随后被送去重新授权。现在所有资料请求统一走 `getCurrentUserProfileWithRefresh`：HTTP 401 / 业务码 `4014905830` 时强制 refresh 一次并重试；refresh token 也已失效时仍走原有的清凭据 + 重新登录，不会掩盖终态。强制刷新失败时若持久化层读回的是同一个旧 token，不再把它当成「另一实例轮换的新凭据」复用，而是清掉失效凭据。
- **流程负责人姓名查询失败会打挂整个流程页面**（`hooks/useFlowList.ts`）：`getFlowOwnerMap` 只吞掉「未授权」错误，Link 超时/DNS 失败仍会抛到 RSC 渲染。负责人姓名只是展示元数据，现在任何 Link 故障都降级为「未知用户」，页面继续渲染；Link 可用性由 `verifySession` / `useUserInfo` 单独上报。
- **Sentry 噪声与本地 DB 未启动告警**（`lib/sentry-filters.ts`、三个 Sentry config）：忽略客户端主动断开（`The destination stream closed early` / `aborted`）、发版后的旧 Server Action（`UnrecognizedActionError`）与 QQ 浏览器内核桥错误；开发环境额外丢弃 `ECONNREFUSED 127.0.0.1/::1`，避免本地 Postgres 没启动时污染共享项目。
- **SAST Link 瞬时不可用时整个工作台渲染失败**（`hooks/useUserInfo.ts`、`app/dashboard/page.tsx`）：`useUserInfo` 一直把 Link 资料请求原样抛出，Link 连接超时（Sentry `SAST-PEOPLE-BG`：`connect ETIMEDOUT 111.229.80.100:443`）会让 `verifySession` 之外的这次资料读取直接打挂 RSC 渲染，用户看到 `SAST-PEOPLE-4`（React #441）错误页；每次发布/落地页请求都会重复。现在只有「未登录 / Link 授权被撤销」继续跳转登录或重新授权，超时、DNS、连接拒绝等瞬时故障记录到 Sentry 后降级为「会话里的 uid / 姓名 / 角色 / 部门」，资料区显示「SAST Link 暂时不可用」而不是误判成新同学引导页；`profileUnavailable` 只影响展示，不写会话、不影响权限判定。新增 `hooks/useUserInfo.test.ts` 与 `app/dashboard/page.test.tsx` 覆盖降级与重新授权两条分支。

- **信息收集表导出的「出生年月」变成 `Sep-26`、且全部显示成 1 号**（`app/api/collection/export/route.ts`、`lib/csv.ts`）：导出值一直是 `YYYY-MM`（如 `2007-05`），Excel / WPS 打开 CSV 时把它识别成日期并自动补当天为 1 号，再按 `MMM-YY` 显示——数据本身没有「日」，页面里的 1 号是表格软件补的。现在年月列改用文本公式导出（`="2007-05"`），表格软件按原样显示数字年月；只对严格合法的 `YYYY-MM` 生效，其余值仍走原有的公式注入转义。新增 `lib/csv.test.ts` 覆盖文本包裹与非法值回退。

- **笔试流程判定了结果，卡片却还挂着「当前步骤：批卷」**（`action/user-flow/edit.ts`、迁移 `0077_terminal_user_flow_final_step.sql`）：终态（`passed` / `failed`）过去写回候选人**当时所在的步骤**——判定结果是在「批卷」页录入的，于是当前步骤停在「批卷」，而候选人卡片的步骤圆点按终态画：已通过时**后面的「录取确认」已经是绿色**（卡片同时说「已通过考核」和「当前步骤：批卷」），未通过时反过来——流程已经结束，后面还挂着一个「未开始」的圆点。现在三条终态写入路径（成绩管理页的设为通过/不通过、管理员手动通过/不通过）一律把当前步骤写在流程**最后一步**，与办公类面试的「结果确认」（`office-rounds.ts` 的 `resultStepId`）、免试/面评的「管理员审核」（`evaluation.ts` 的 `findEvaluationStepIdInTx`）同一约定；「未参与」（`withdrawn`）不动当前步骤，候选人停在离开的那一步。存量终态行由迁移对齐到各自流程的最后一步（当前步骤为空、或不是最后一步的都对齐，不动未参与行），已发布的流程同样受益——发布锁定的是结果，不是这个步骤指针。
- **改了笔试模板正文，下面的两个说明框就没了**（`emails/offer.tsx`、`lib/email/blocks.ts`）：结果邮件的版式过去是「有自定义正文就整段替换默认分支」——报名入口（成员信息表 + 飞书群）与「查看授课日历」两张卡片正好写在被替换的那段 JSX 里，于是管理员一填正文，两个入口就一起消失（未通过通知的日历入口同样）。现在结构卡片由流程类型决定、与正文文案解耦，自定义正文只替换散文段落；`defaultResultEmailBlocks()` 的内置版式与逐段比对的 12 套邮件一起守住了这条。
- **模板编辑器里的斜杠菜单「看得见、点不到」**（`components/email/RichTextField.tsx`）：菜单挂在 `document.body` 上，而 Radix 弹窗打开时会给 `body` 设 `pointer-events:none`，于是整个菜单的 `pointer-events` 被继承成 `none` —— 实测点它命中的是底下的画布段落，只能靠方向键 + 回车选中（`getByRole` 点击超时）。现在菜单挂进弹窗内容里（`[data-slot="dialog-content"]`，坐标按弹窗换算），既能点，也不会被 Radix 当成「点在弹窗外面」而顺手关掉弹窗；同时在编辑器失焦时收起菜单 —— 之前点到卡片里另一个富文本后，菜单会一直挂在屏幕上。
- **重复保存会把正文里的默认内联样式越堆越长**（`lib/email/sanitize.ts`）：清洗器的 `transformTags` 无条件把标签默认样式**前置拼接**到已有的 `style` 上，而清洗在保存与渲染时都会跑，于是每保存一次链接的 `style` 就多一份 `color:#1d4ed8;text-decoration:underline` —— 实测同一行被存成 4 份、正文体积随保存次数线性增长，也让「跟上次保存比有没有改动」永远判成有改动。现在同名属性已经有了就不再补（已有声明仍排在后面，优先级不变），清洗变成幂等，`lib/email/sanitize.test.ts` 加了「重复清洗三次结果一致」的回归测试。
- **区块样式浮层显示的是悬停那一刻的旧值**（`components/email/EmailCanvas.tsx`）：`BlockMenu` 一直拿 `hovered.block`（拖动把手的悬停快照）当数据源，改完样式后快照不会更新——点了「居中」按钮不高亮、下拉回到「默认」，看起来像没生效（值其实已经写进草稿）。现在按位置从最新区块数组里取（`blocks[indexAt(pos)]`），浮层与画布始终一致。
- **打开模板编辑器可能把整篇正文清空**（同文件）：`useEditor` 的 `editable` 选项 + 挂载后补一次 `editor.setEditable(editable)`，而 TipTap 的 `setEditable` **默认会 emit `update`**（哪怕值没变）——那一下发生在「正文灌进编辑器」之前，`onUpdate` 于是拿空文档算出 `[]` 回写草稿，整篇正文被清掉，画布显示「正文还是空的」并且立刻标成有未保存改动。现在只在真的需要切换时才调 `setEditable(editable, false)`，并加了「正文灌进编辑器之前不认任何 update」的闸门（`hydratedRef`），任何早到的 update 都不会再清空草稿。

#### 办公类签到叫号

- **扫码签到一直报「二维码内容无效，请重试」**（`components/userInfo/showQrCode.tsx`、`app/dashboard/page.tsx`、`components/recruitment/checkin/checkinScanner.tsx`）：身份码的载荷一直是 `{"uid":"123",...}`（`ShowQrCode` 的 prop 声明成字符串、仪表盘再传一次 `userInfo.id.toString()`），而签到台解析时要求 `typeof payload.uid === "number"`，于是扫任何人的身份码都直接落进 catch，现场只能改用姓名/学号手动签到；同一个码在阅卷台能用，只是因为那边不做类型校验、靠隐式转换侥幸通过（`JSON.parse` 返回 `any`，TS 也拦不住）。现在身份码统一按**数字** uid 编码（prop 收窄为 `number`，仪表盘传 `userInfo.id`），签到台也把扫到的 uid 统一 `Number()` + `Number.isSafeInteger()` 收敛后再用——已经打开着的旧标签页里那张字符串码仍能扫。
- **大屏语音播报把「部长姓名」当成地点念**（`lib/queue-announcer.ts`）：面试位名允许填部长姓名（「新增面试位」的说明里就写着「如「1 号位」或部长姓名」），但播报把面试位名原样当地名，填了名字就会念成「到 张伟」；现在以「位」结尾的位置名照旧直接用，其余补成「到 张伟 的面试位」，名称为空时回退成「到 面试位」。

- **别的部门的候选人也露着「写面评」，一点就报「读取面试记录失败」**（`action/user-flow/checkin.ts`、`components/recruitment/checkin/checkinConsole.tsx`）：场地是多个办公部门共用的，叫号页刻意不按部门切分数据，于是「写面评」入口对每个部门的面试位与队列行都渲染；但面评写进的是候选人**报名归属部门**，服务端 `createEvaluation` / `getOfficeInterviewRecord` 仍按部门收口（`integration/office-interview-rounds.integration.test.ts` 守住这条），点开必然拿到「无权操作其他部门的候选人」，随手面评弹窗只显示一句「读取面试记录失败」。现在快照按**候选人报名归属部门**给出 `canWriteRecord`（与 `createEvaluation` / `getOfficeInterviewRecord` 同一个 `canAccessDepartment` 谓词——流程部门与报名归属被改派成不一致时也不会露出点不通的入口；管理员全放行、部长仅本部门），不是本部门的面试位与队列行不再渲染该入口；叫号 / 开始面试 / 结束面试这些场地动作仍按共用场地跨部门可用。
- **「写面评」在「已叫号」就出现**（同文件）：候选人还没进场（`called`）面试位上就与「开始面试」并排摆着「写面评」；现在要开始面试（`interviewing`）之后才出现，队列里已完成的行仍能补写。
- **已完成行的状态徽标与按钮分处两行右端**（同文件）：`已完成` 徽标挂在第一行右端、`写面评` 按钮挂在第二行右端，右边缘错开成两截；现在两者收进同一行的右侧簇。

#### Link 会话

- **refresh token 被 Link 整族撤销后每个服务端请求都重试一次 refresh**（`lib/link/oauth.ts`、`lib/link/session.ts`、`lib/session.ts`）：Link 在角色变更 / 密码变更 / 封禁 / 注销时整族撤销某用户的 refresh token family（审计 `revoked_reason` 如 `admin_role_change`），而 People 会话继续持有已经死亡的 refresh token——`POST /oauth/token` 的非 200 被抛成不带状态码的普通 `Error`，刷新失败后又原样 rethrow，死 token 留在 session 表里、`shouldRefreshLinkToken()` 下次仍为 true，于是每个请求都再打一次 Link（同一用户 2 分钟内 20+ 条 `invalid_grant`），用户全站报错却拿不到重新登录的引导。现在：OAuth token 端点非 2xx 抛结构化 `LinkOAuthTokenError`（携带 HTTP `status` 与 OAuth `error`）；刷新收到终态的 `400 invalid_grant` 时清除该用途的本地凭据并让调用方走「缺 token」分支，本次与后续请求都重新授权（`/login` 或 `/api/auth/link/start`），不再形成每请求一次的重试循环。两处竞态/共享细节：清理在行锁内以「刚失败的 refresh token 仍是当前存值」为条件（`refreshInFlight` 只协调单个实例，按 `sessionId` 无条件清理会误清另一实例刚轮换出的新凭据）；admin 请求在没有自己的 refresh token 时复用登录 token、与 session 请求共享同一次刷新，因此缺失令牌错误按**每个请求自己的 purpose** 转换，不能由先发起者的 purpose 决定（否则 admin 先刷新时 session 请求会被误判成 admin 授权缺失、不再跳 `/login`）。网络错误与 Link 5xx 视为瞬时故障保留 token，另一实例已并发轮换出新 token 时优先复用、不清除。`lib/link/session.test.ts`、`lib/link/oauth.test.ts`、`lib/session.test.ts` 与 `integration/link-session-revocation.integration.test.ts` 覆盖撤销、瞬时失败、并发复用与受保护清理四种路径。

#### 操作审计

- **管理员的操作记录显示为「部长」**（`migrations/0069_audit_view_as_actor_role_fix.sql`）：PR #250 合并前的分支版本把操作审计写成 `session.role`（「切换身份查看」的临时视角角色），管理员以部长视角浏览时做的操作在审计里记成了部长；合并版（f1d9d5c）起所有写路径固定记录 `session.realRole`，本次迁移再把那段窗口里已经写错的历史行改成真实角色——只改「同一次 `session.view-as.start`（`metadata.role` = 被模拟角色）到对应 stop（无 stop 按视角 cookie 12 小时封顶）之间、`actor_role` 恰等于被模拟角色」的行，靠真实角色不可能写出这些行；修正值取该窗口 start 行记录的真实角色，没有 start/stop 记录的数据不会被触碰。
- **取消报名后审计只剩 "user_flow"**（`lib/operation-audit-list.ts`）：取消报名会物理删除 `user_flow` 行，列表联表取不到流程名，资源列直接退化成资源类型。现在资源标签回退到审计元数据——优先 `metadata.flowTitle` 快照，其次按 `metadata.flowId` 反查流程标题，显示为「考生流程：<流程名>（报名已取消）」，`integration/audit-log-labels.integration.test.ts` 覆盖；查询对象（`targetUser`）照旧从元数据解析。
- **「未命名操作」补齐中文名**（`components/audit/audit-log-table.tsx`、`lib/operation-audit-list.ts`）：`flow.update_workspace`、`flow.office_round_one.close`、`flow.office_round_two.close`、`department.user_flow.backfill`、`user_flow.interview_slot.request/review/update`、`user_flow.office_final_destination.set`、`session.view-as.start/stop`、`demo.seed` 补上标签并纳入快捷筛选分组；身份切换记录的元数据同时中文化（「查看身份：部长 · 部门：科宣部」，不再显示 `role：3`）。

#### 面评审批

- **已归档的通过/不通过结果在流程发布前无法改判**（`action/user-flow/evaluation.ts`、`components/manage/approvalsContent.tsx`）：审批页「已归档」里的「改为通过 / 改为不通过」按钮此前点了必然报「该候选人结果已确认，不能再修改」——`approveEvaluation` / `rejectEvaluation` 的终态锁把 `passed`/`failed` 一律挡住，而这两个状态正是第一次终审自己写下的（生产 Sentry：`role 4` 在 `/dashboard/approvals` 上 `approve-evaluation` 报错）。现在终态锁只保留「已撤回」（防止把撤回的报名复活），已通过/不通过的结果只要流程还没发布（发布中/已发布由 `moveUserFlowInTx` 锁定）就能互相改判，面评状态与候选人状态一起翻转并写操作审计；操作失败时前端直接显示服务端消息，不再只给一句「操作失败」。`integration/evaluation-result-flip.integration.test.ts` 覆盖改判、发布锁定与撤回拦截。

#### 批卷评分归属

- **一题被两位讲师同时批改时，先保存者把题锁死、另一位讲师从此改不动**（`action/user-flow/user-point/upsert.ts`、`hooks/useUserPointList.ts`、`components/review/markProblemTable.tsx`、`app/api/user-point/route.ts`）：题目归属（`user_point.fk_judger_id`）本来就是「谁先保存算谁的」，但读路径完全没体现归属——另一位讲师照样能输入，逐题自动保存返回 409（「评分已被其他批卷人保存，请刷新后查看」），而刷新后分数仍是对方的、再输入还是同一个错；更糟的是「确认评分并返回扫码页」会把范围内全部题目一起提交，只要有一题是别人的就整批回滚 → 讲师既改不了分、也回不了扫码页，只能按返回键逃出去（`14ca26a` 的整批原子性反而把人钉在页面上）。现在批卷页按归属渲染：他人已保存的题显示「本题已由 XXX 批改保存，无法修改；如需调整请联系部长」并禁用输入，不进自动保存、不进批量载荷（部长及以上仍可覆盖，归属语义不变）；保存时才撞上并发抢题（409）的，用响应携带的 `conflicts` 把该题就地转只读并重新拉取对方分数；注意批量提交是整批回滚，需要再点一次确认才会写入其余题目。错误文案不再出现「请刷新后查看」。
- **评分覆盖在审计里看不出「谁改的、覆盖了谁」**（`action/user-flow/user-point/upsert.ts`、`lib/operation-audit-list.ts`、`components/audit/audit-log-table.tsx`）：`review.score.upsert` 的 `scoreChanges` 只记分数与备注，部长覆盖讲师评分后无法追溯归属变化。现在每条变更记录 `previousJudgerId` / `nextJudgerId`（读取时换算成姓名），审计列表摘要与「评分变更」逐题标注「覆盖 讲师甲 的评分」；「同分但换了阅卷人」也算一次变更，避免改派不留痕，而同一人重复保存同一分数仍不产生新记录。`integration/review-score-ownership.integration.test.ts` 覆盖占用、整批回滚、部长覆盖与审计前后阅卷人。

#### 批卷加固（线下阅卷现场）

- **批量提交可能永久卡在「正在提交评分」**（`components/review/markProblemTable.tsx`）：批量提交的 `fetch` 既没有超时也没有中断，网络半死（TCP 不响应、代理 hang、慢查询）时按钮一直 loading、toast 常驻，讲师只能刷新页面并丢掉未保存的输入。现在单题自动保存 15s、批量提交 30s 超时上限：批量超时会明确提示「提交超时，未确认服务端是否已保存；请重新打开该考生核对分数后再确认」并恢复可点击，单题超时提示「保存超时，分数尚未保存；请检查网络后再改一次，或点确认评分整批重发」且保留输入值。
- **现场常见的四类失败原因被兜底成「操作失败」**（`action/user-flow/user-point/upsert.ts`、`app/api/user-point/route.ts`）：结果已确认、题目已从试卷中删除、题目不属于该考生流程、超出被改小后的满分——这些原本都是普通 `Error`，被 `apiErrorResponse` 归为 500 且不回显内部文案，讲师只能看到「操作失败」而无法判断。现在统一走新的 `ScoreValidationError` → HTTP 422 并回显原文（「该考生笔试结果已确认，不能再修改评分」「该考生已退回当前流程，不能再修改评分」「得分不能超过题目满分 80」「试卷已变更，部分题目不存在，请重新设置阅卷范围」「题目不属于当前考生流程，请重新设置阅卷范围」）。
- **归属冲突时的提交提示与实际行为不符**（`components/review/markProblemTable.tsx`）：批量提交撞上他人已保存的题目时是**整批回滚**（没有冲突的题这一批也没写），原文案「部分题目已被其他批卷人保存」容易被理解成其余已保存，讲师直接离开就会漏掉这次提交。现在提示明确要求「请再点一次『确认评分并返回扫码页』完成提交」，并修正了代码注释。
- **已退回（`withdrawn`）的报名仍能被讲师写分**（`action/user-flow/user-point/upsert.ts`）：扫码/手输入口会拦住，但直开批卷页或之前已打开的页面照样写入。现在讲师（role < 3）写 `withdrawn` 考生被拒并回显原因，分数不落库；部长及以上仍可写，作为结果被误确认后的更正通道。
- **批卷页头部只显示学号**（`action/user-flow/find.ts`、`app/api/user-flow/route.ts`、`hooks/useUserFlow.ts`、`components/review/markProblemTable.tsx`）：现场只能凭学号认人，容易批错考生。现在头部显示「正在批改：姓名（学号）」。
- **阅卷范围选择器会列出没有笔试题的流程**（`app/dashboard/review/page.tsx`、`hooks/useFlowList.ts`）：下拉的数据源是「本部门 + 时间窗内」的全部流程，讲师选到面试/免试/WOC/SOC 这类没有题目的流程后，勾不了题、保存不了范围，只能重选，白折腾一趟。现在新增 `useReviewableFlowList`：只保留**至少有一个未删除步骤挂题目**的流程（这些流程才参与阅卷范围的时间窗校验）。
- **扫码与手输学号的确认弹窗不一致**（`components/review/reviewCandidateDialog.tsx`、`components/review/qrcodeScanner.tsx`、`components/review/mannualInput.tsx`）：扫码侧标题是「确认学生信息」、只列学号/姓名/专业、确认按钮是链接；手输侧标题是「确认考生信息」、多一列学院、按钮文案是「确认进入阅卷」——同一件事两套界面，现场核对容易漏看学号或学院。现在两个入口共用同一个 `ReviewCandidateDialog`：标题「确认考生信息」+ 说明，字段统一为姓名、学号（等宽字体）、学院（取不到时隐藏）、专业（取不到显示「未填写」），按钮统一为「取消」+「确认并开始阅卷」，并且都用 `router.push` 进入评分页。

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
