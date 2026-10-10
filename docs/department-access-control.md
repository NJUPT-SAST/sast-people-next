# 部门权限隔离

| 项目 | 内容 |
| --- | --- |
| 文档状态 | Draft |
| 适用范围 | 部门级数据可见性（流程 / 报名 / 评分 / 面评 / 排期 / 邮件 / 审计） |
| 迁移 | `0060_department_scoped_access.sql`（部门列与索引）、`0061_email_template_departments.sql`（模板部门覆盖）、`0062_office_interview.sql`（办公类部门面试：流程类型/时段）、`0063_interview_slot_change_request.sql`（改期申请表）、`0064_office_interview_single_flow.sql`（办公类每部门一条流程）、`0065_interview_slot_change_tech.sql`（改期申请仅技术部门）、`0066_office_department_flows.sql`（办公类每部门一条流程定稿）、`0067_office_slot_change_cleanup.sql`（办公类改期清理） |
| 迁移（续） | `0068_email_template_member_form_label.sql`（「成员信息表」按钮文案接回 `member_form_label`）、`0069_audit_view_as_actor_role_fix.sql`（修正「切换身份查看」早期写下的审计角色）、`0070_office_email_subject_without_name.sql`（办公类结果邮件主题去掉姓名）、`0071_office_final_destination_decided_at.sql`（办公类最终去向「当届有效」，加 `user_flow.final_department_decided_at`）、`0072_flow_registration_closed_at.sql`（`flow.registration_closed_at` 报名截止）、`0073_interview_checkin.sql`（`interview_checkin` 现场签到与叫号）、`0074_interview_stations.sql`（`interview_station` 面试位）、`0075_interview_checkin_skip_count.sql`（`interview_checkin.skip_count` 过号次数）；当前 head = `0075` |
| 最后更新 | 2026-10-10 |

## 1. 模型

部门标识由 SAST Link 维护（`profile.department`）。People 把部门标识按不透明字符串存储（`normalizeDepartmentKey`，最长 64 字符），同时**内嵌一份部门目录与派生常量**：中文名（`const/department.ts:8-16` `DEPARTMENT_LABELS`）、大类（`:39-47` `DEPARTMENT_CATEGORIES`）、办公类可选部门顺序（`:50-56` `OFFICE_DEPARTMENT_KEYS`）、叫号号段前缀（`:62-73` `DEPARTMENT_QUEUE_PREFIX`）、暂不启用清单（`:81` `DISABLED_DEPARTMENT_KEYS`）。因此 Link 侧新增部门后，People 仍要发版才能拿到它的中文名 / 分类 / 号段：未知标识原样展示（`departmentLabel` 回落标识本身）、`departmentCategory` 保守按 `unknown`、号段回落 `D`。

People 侧的归属字段：

| 字段 | 含义 |
| --- | --- |
| `flow.department` | 流程归属部门；`NULL` = 全局流程，仅管理员可见/可编辑 |
| `flow.group_departments` | 组别 → 部门 映射（组别是部门内的细分；共享流程据此给候选人定部门） |
| `user_flow.department` | 报名（投递）部门 = 组别映射 ?? 流程归属，报名与改组别时固化 |
| `operation_audit.department` | 操作审计归属部门，写入时解析 |
| `feedback_report.department` | 反馈归属部门，提交时按提交人部门解析 |
| `email_template_setting.department` / `email_template_content.department` | 邮件模板覆盖归属部门；`NULL` = 全局默认（仅管理员可写） |
| `people_session.department` | 当前会话用户的部门缓存，dashboard 布局按最小间隔 5 分钟回源 Link 刷新 |

角色阶梯与 SAST Link 完全一致（`lib/link/role.ts`）：

| People role | Link role | 名称 | 能力（均需部门 scope，管理员除外） |
| --- | --- | --- | --- |
| `0` | `freshman` | 新同学 | 报名、查看本人流程 |
| `1` | `member` | 部员 | 报名、查看本人流程 |
| `2` | `lecturer` | 讲师 | 试卷批改、笔试/面试管理、成员目录（只读全部成员，无手机号） |
| `3` | `manager` | 部长 | 讲师能力 + 签到叫号（`/checkin`）、邮件中心、流程管理、面评审批、操作审计 |
| `4` | `admin` | 管理员 | 平台面与跨部门：部门管理、反馈记录、错误日志、用户封禁、邮件模板全局默认、切换身份查看（仅 role 4），可见全部部门 |

可见性规则：

- 管理员（Link `admin`，role 4）→ 全部部门。
- 部长 / 讲师 / 部员 → 仅本人所属部门（Link 里的 `profile.department`）；`department IS NULL` 的数据（全局流程、未归属记录）只有管理员可见。
- 严格模式：没有部门归属的账号看不到任何部门数据，服务端报「当前账号未归属任何部门，请联系管理员分配部门。」。
- 能力（role）与可见性（department）叠加：`verifyScopedRole(2/3)` 决定能不能做这类操作，scope 决定能看到谁的数据。
- 平台级资源仅管理员：反馈记录、错误日志、用户封禁、部门管理页。
- 办公类部门没有讲师这一级：办公类流程（`office_interview`，**每个办公部门一条独立流程**，`flow.department` = 部门）的面试管理、候选人评分、面评提交与面试时段调整都要求部长（`manager`，角色 3），且部门之间互不可见（与其它部门流程同一套部门隔离）；技术部门流程仍由讲师（角色 2）评分，且非办公流程的面评只能由预约讲师本人提交。
- 改期申请（`interview_slot_change_request`）只用于技术部门（免试/WOC/SOC）：由预约讲师（日程发起人）审批，管理员可兜底；办公类时段调整不走申请表，由部长在面试管理页直接修改 `user_flow.interview_slot`（记录审计）；审批列表按所选流程加载。
- 办公类「最终去向」（`user_flow.final_department`）：同一候选人通过多个办公部门时，部长/管理员可在结果发布前指定最终归属部门（写 `final_department` 并立即重新同步成员部门）；该评议值**当届有效**——只在这批流程的窗口内优先，决策之后新创建的流程一旦产生通过记录，就回到「最后一次通过覆盖」的自动规则（迁移 0071 引入 `user_flow.final_department_decided_at` 记录决策时刻；`lib/flow-result-department.ts:80-96`）。为空时按「第一志愿优先」自动归属，没有第一志愿通过时按「最后一次通过」选部门。
- 办公类志愿与报名规则：办公类是「按流程（=办公部门）报名」，没有投递组别，报名记录带 `user_flow.choice`（1=第一志愿、2=第二志愿，`db/schema.ts:205`）；进行中的办公类报名最多两条，且必须一条第一志愿、一条第二志愿，同一志愿不能重复（`action/user-flow/register.ts:174-208`）。
- 办公类名单确认制（一面/二面）：候选人按 `user_flow.round` 走（1=一面、2=二面）。一面为单人终评，部长确认一面名单后，进入二面即一面通过、停在 `round=1` 且落选即一面不通过（`lib/office-round-one-roster.ts:1-8`、`:37-49`）；结果快照留档两轮均分（`action/flow/result-publication.ts:83-88`）。
- 办公类报名截止：一面名单确认时同事务写入 `flow.registration_closed_at`（`action/user-flow/office-rounds.ts:363-366`），此后报名入口把流程置灰并标注「报名已截止」，服务端 `register` 同样拒绝（`components/userFlow/submitRegister.tsx:40`、`action/user-flow/register.ts:230`）。
- 邮件模板按部门覆盖：`email_template_setting` / `email_template_content` 以 `(template_key, department)` 存储，`department IS NULL` 为全局默认（仅管理员可写），部长可维护本部门覆盖，并可只读浏览其他部门的覆盖；渲染时部门覆盖 → 全局默认 → 内置默认文案。
- 候选人自身通常还没有所属部门（例如新生）；只要能命中本部门的报名记录，就可以被本部门查看。

### 1.1 签到叫号不吃部门 scope

上面「能力均需部门 scope」的总述有一个有意为之的例外：**现场签到台与大屏不做部门过滤**。

- 鉴权用的是 `verifyRole(MANAGER_ROLE)`（所有部长，role ≥ 3），而非 `verifyScopedRole`：`app/dashboard/checkin/layout.tsx:8-15`、`app/checkin/board/layout.tsx:14`。
- 因此全部门的部长都能看到全部办公部门的排队/签到数据。原因是场地与面试位在办公部门之间共用，签到台与叫号大屏需要跨部门统一视图，按部门 scope 收敛反而会让现场看不到别的部门队列。
- 导航项「签到叫号」在 `components/route.tsx:99-105` 标了 `requiresDepartment: true`（未归属部门的账号不进这个入口），但页面本身不按 `department` 收敛数据。

### 1.2 切换身份查看

管理员（role 4）可以从顶栏「切换身份查看」临时切到任意身份 / 部门预览（`action/view-as.ts:41` 校验 `session.realRole >= ADMIN_ROLE`，其余角色抛「只有管理员可以切换身份查看」；入口组件 `components/view-as-switcher.tsx`）。切换后界面按临时视角的角色 / 部门渲染（办公部门不提供讲师选项）；`startViewAs` / `stopViewAs` 都写操作审计，且 `actorRole` 记录的是操作人真实角色 `session.realRole`（`action/view-as.ts:64-73`、`:82-92`；迁移 0069 修正了早期版本误记临时视角角色的历史行）。

## 2. 代码入口

| 位置 | 作用 |
| --- | --- |
| `lib/authz.ts` | `isAdmin`、`getDepartmentScope`、`canAccessDepartment`、`assertDepartmentAccess`、`departmentScopeFilter`、`verifyScopedRole`、`verifyManager`、`verifyAdmin` |
| `lib/flow-access.ts` | `visibleFlowPredicate`（本部门流程 + 已有本部门报名记录的全局流程）、`canEditFlow`、`assertFlowEditable`、`assertUserFlowInScope`、`resolveUserFlowDepartment` |
| `lib/session.ts` | `syncCurrentSessionIdentity`（dashboard 布局调用，角色与部门未同步或超过 5 分钟才回写） |
| `hooks/useFlowList.ts` | `useFlowList`（全部未删除流程，仅过滤停用部门——候选人报名入口与管理面列表使用）、`useDepartmentFlowList`（按 `visibleFlowPredicate` 收敛到本部门，阅卷/笔试/面试工作台使用） |
| `const/department.ts` | `departmentLabel`（已知 Link 标识 → 中文名，未知标识原样展示）、`departmentCategory`、`OFFICE_DEPARTMENT_KEYS`、`departmentQueuePrefix`、`isDepartmentEnabled` |
| `lib/email-center/template-access.ts` | 邮件模板的部门维度：`resolveTemplateEditTarget`（写目标）、`templateReadFilter`（读范围）、`canEditTemplateRow`、`pickTemplateSettingRow`（部门覆盖 → 全局默认） |
| `action/department/manage.ts` | 部门概览、流程/报名记录归属分配 |
| `action/view-as.ts` | `startViewAs` / `stopViewAs`：仅管理员（role 4）切换临时身份 / 部门，写审计（`actorRole` = 真实角色） |
| `components/view-as-switcher.tsx` | 顶栏「切换身份查看」入口与临时视角提示条 |
| `lib/interview-checkin.ts` | 签到 / 叫号 / 进场 / 结束 / 过号（不按部门 scope） |
| `lib/queue-announcer.ts` | 大屏叫号广播 |
| `app/dashboard/checkin/layout.tsx` / `app/checkin/board/layout.tsx` | 签到台 / 大屏鉴权：`verifyRole(MANAGER_ROLE)`，不做部门 scope |
| `components/route.tsx` | 导航入口按 `MenuItem.minRole`（+ `requiresDepartment`）过滤；`getVisibleMenuItems` / `getMenuGroups` |

约定：读路径用过滤（返回空集），写路径用断言（抛中文错误）；每个 server action / route handler 自行校验，不依赖 layout。

**API 路由的错误码**（`lib/api-error.ts` + `lib/access-error.ts`）：未登录（`verifySession` 的登录跳转）→ 401「未登录或会话已失效」；角色/部门不足（`ForbiddenError`，`DepartmentAccessError` 是其子类）→ 403 且只回显权限文案；其他内部错误 → 500 统一文案，不回显内部 `error.message`。`/api/test/session` 的 Playwright 后门额外要求 `NODE_ENV !== "production"`。

## 3. 上线步骤

1. `pnpm db:migrate` 应用 `0060_department_scoped_access.sql`（部门列与索引）与 `0061_email_template_departments.sql`（模板部门覆盖），以及办公类部门面试与后续修复的 `0062`–`0075`（办公类面试/改期申请/每部门一条流程/模板与审计修复/最终去向当届有效/报名截止/现场签到叫号与面试位/过号次数）；当前 head = `0075_interview_checkin_skip_count.sql`。
2. 确保跨部门管理账号在 Link 里是 `admin`（管理员身份完全来自 Link 角色，People 不再维护本地名单）。
3. 管理员在 `/dashboard/departments` 把存量流程与报名记录分配到部门；`department` 为空的记录对其他部门不可见。归属下拉与概览行都是「内置部门目录 ∪ 库里已有标识」：内置目录来自 `const/department.ts` 的 `DEPARTMENT_KEYS`（`DEPARTMENT_LABELS` 的键，Link 新增部门需发版才会出现在这里），目录里的部门即使还没有任何数据也会列出来（0 条）并可直接选择，存量/未知标识继续保留（`action/department/manage.ts:35-37`、`:171-184`）。给流程定归属时，本流程仍未归属的报名记录按报名时的同一口径（组别映射 → 流程归属）**自动跟随**；已经归属过的流程可在「报名记录归属」页一键**「按流程归属回填」**，剩下的都是流程自己也没归属的记录。
4. 确认 Link 已为成员填写部门；未填写部门的账号在严格模式下看不到候选人。
5. 共享流程/技术部门流程（`department` 为空但多部门参与）在流程编辑器里配置「组别 → 部门」映射，候选人据此归属；办公类流程自 0066 起每个部门一条，不再需要组别映射。
6. 邮件模板按部门配置：`/dashboard/emails` 的「模板归属」选择器中，管理员维护全局默认与任意部门覆盖，部长维护本部门覆盖；未配置覆盖时自动回落全局默认与内置文案。

## 4. 验证

```bash
pnpm test -- lib/authz.test.ts lib/flow-access.test.ts hooks/useUserInfoById.test.ts
DATABASE_URL=... pnpm test:integration
```

集成测试覆盖：部门流程与共享流程的可见性矩阵、候选人按部门过滤、归属分配（`integration/department-scope.integration.test.ts`、`integration/department-manage.integration.test.ts`）、阅卷入口的部门隔离与角色门槛（`integration/review-access.integration.test.ts`）、办公类名单确认与最终去向/改时段护栏（`integration/office-interview-rounds.integration.test.ts`）。

**成员目录不受部门隔离**：讲师及以上都能查看全部成员（Link 的用户目录本身也不限部门），只有敏感字段按角色收敛——手机号 role ≥ 3（部长/管理员），QQ role ≥ 2。部门隔离作用于业务数据（流程/报名/评分/面评/排期/邮件/审计），不作用于成员目录与成员详情。

**流程的读与写分开**：

| 面 | 可见范围 |
| --- | --- |
| 候选人报名（我的流程） | 全部未删除流程，不做部门过滤 |
| 流程管理列表 | 全部未删除流程（部长及以上可见），行内编辑/删除/发布按 `canEditFlow` 收敛到流程归属部门 |
| 试卷批改、笔试管理、面试管理的流程选择器 | 仅与本部门相关的流程：本部门流程 + 「已有本部门报名记录」的全局共享流程；管理员不过滤 |

**面评审批**：部长只看到本部门的面评；管理员看到全部，并可在页面上按部门筛选。办公类流程**不进面评审批列表**（`action/user-flow/evaluation.ts:974` 用 `ne(flow.type, OFFICE_INTERVIEW_FLOW_TYPE)` 排除），办公类面评提交即留档（`action/user-flow/evaluation.ts:637-639`），由部长在面试管理/名单确认页处理。

## 5. 界面字段口径

| 界面用词 | 含义 | 来源 |
| --- | --- | --- |
| 所属部门 | 这个人属于哪个部门（决定他能管哪个部门的数据） | Link `profile.department`，People 只读 |
| 投递部门 | 这条报名记录投给了哪个部门（决定评分/面评/排期/邮件的可见范围） | People 的 `user_flow.department`，报名时固化 |
| 归属部门 | 管理员给流程/报名记录指定的部门（`/dashboard/departments`、流程编辑器） | People 的 `flow.department` / `user_flow.department` |

未设置：`所属部门` 为空时显示「未设置部门」；`投递部门`/`归属部门` 为空时显示「未归属部门」（这类数据只有管理员可见）。

**工作台里的「投递部门」只在它没被流程归属隐含时才显示**：部门自有流程下所有候选人都归同一个部门（页签与流程名已经写了），面试与笔试工作台不再逐行重复；共享流程（流程无归属）或候选人与流程归属不一致时才列出来。敏感字段按角色收敛：笔试工作台的候选人 QQ 讲师（role ≥ 2）就能看到（联系候选人用），手机号仍只在部长及以上（role ≥ 3）。
