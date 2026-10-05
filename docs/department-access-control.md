# 部门权限隔离

| 项目 | 内容 |
| --- | --- |
| 文档状态 | Draft |
| 适用范围 | 部门级数据可见性（流程 / 报名 / 评分 / 面评 / 排期 / 邮件 / 审计） |
| 迁移 | `0060_department_scoped_access.sql`（部门列与索引）、`0061_email_template_departments.sql`（模板部门覆盖）、`0062`–`0067`（办公类部门面试：类型/时段/改期申请表/每部门一条流程/清理） |
| 最后更新 | 2026-09-28 |

## 1. 模型

部门标识由 SAST Link 维护（`profile.department`）。People 不落库部门目录，按不透明字符串处理（`normalizeDepartmentKey`，最长 64 字符），Link 扩展部门时无需发布 People。

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
| `3` | `manager` | 部长 | 讲师能力 + 邮件中心、流程管理、面评审批、操作审计 |
| `4` | `admin` | 管理员 | 平台面与跨部门：部门管理、反馈记录、错误日志、用户封禁、邮件模板全局默认，可见全部部门 |

可见性规则：

- 管理员（Link `admin`，role 4）→ 全部部门。
- 部长 / 讲师 / 部员 → 仅本人所属部门（Link 里的 `profile.department`）；`department IS NULL` 的数据（全局流程、未归属记录）只有管理员可见。
- 严格模式：没有部门归属的账号看不到任何部门数据，服务端报「当前账号未归属任何部门，请联系管理员分配部门。」。
- 能力（role）与可见性（department）叠加：`verifyScopedRole(2/3)` 决定能不能做这类操作，scope 决定能看到谁的数据。
- 平台级资源仅管理员：反馈记录、错误日志、用户封禁、部门管理页。
- 办公类部门没有讲师这一级：办公类流程（`office_interview`，**每个办公部门一条独立流程**，`flow.department` = 部门）的面试管理、候选人评分、面评提交与面试时段调整都要求部长（`manager`，角色 3），且部门之间互不可见（与其它部门流程同一套部门隔离）；技术部门流程仍由讲师（角色 2）评分，且非办公流程的面评只能由预约讲师本人提交。
- 改期申请（`interview_slot_change_request`）只用于技术部门（免试/WOC/SOC）：由预约讲师（日程发起人）审批，管理员可兜底；办公类时段调整不走申请表，由部长在面试管理页直接修改 `user_flow.interview_slot`（记录审计）；审批列表按所选流程加载。
- 办公类「最终去向」（`user_flow.final_department`）：同一候选人通过多个办公部门时，部长/管理员可在结果发布前指定最终归属部门（写 `final_department` 并立即重新同步成员部门）；为空时按「第一志愿优先」自动归属。
- 邮件模板按部门覆盖：`email_template_setting` / `email_template_content` 以 `(template_key, department)` 存储，`department IS NULL` 为全局默认（仅管理员可写），部长可维护本部门覆盖，并可只读浏览其他部门的覆盖；渲染时部门覆盖 → 全局默认 → 内置默认文案。
- 候选人自身通常还没有所属部门（例如新生）；只要能命中本部门的报名记录，就可以被本部门查看。

## 2. 代码入口

| 位置 | 作用 |
| --- | --- |
| `lib/authz.ts` | `isAdmin`、`getDepartmentScope`、`canAccessDepartment`、`assertDepartmentAccess`、`departmentScopeFilter`、`verifyScopedRole`、`verifyManager`、`verifyAdmin` |
| `lib/flow-access.ts` | `visibleFlowPredicate`（本部门流程 + 已有本部门报名记录的全局流程）、`canEditFlow`、`assertFlowEditable`、`assertUserFlowInScope`、`resolveUserFlowDepartment` |
| `lib/session.ts` | `syncCurrentSessionIdentity`（dashboard 布局调用，角色与部门未同步或超过 5 分钟才回写） |
| `hooks/useFlowList.ts` | `useFlowList`（全部未删除流程，仅过滤停用部门——候选人报名入口与管理面列表使用）、`useDepartmentFlowList`（按 `visibleFlowPredicate` 收敛到本部门，阅卷/笔试/面试工作台使用） |
| `const/department.ts` | `departmentLabel`：已知 Link 标识 → 中文名，未知标识原样展示 |
| `lib/email-center/template-access.ts` | 邮件模板的部门维度：`resolveTemplateEditTarget`（写目标）、`templateReadFilter`（读范围）、`canEditTemplateRow`、`pickTemplateSettingRow`（部门覆盖 → 全局默认） |
| `action/department/manage.ts` | 部门概览、流程/报名记录归属分配 |
| `components/route.tsx` | 导航入口按 `MenuItem.minRole`（+ `requiresDepartment`）过滤；`getVisibleMenuItems` / `getMenuGroups` |

约定：读路径用过滤（返回空集），写路径用断言（抛中文错误）；每个 server action / route handler 自行校验，不依赖 layout。

**API 路由的错误码**（`lib/api-error.ts` + `lib/access-error.ts`）：未登录（`verifySession` 的登录跳转）→ 401「未登录或会话已失效」；角色/部门不足（`ForbiddenError`，`DepartmentAccessError` 是其子类）→ 403 且只回显权限文案；其他内部错误 → 500 统一文案，不回显内部 `error.message`。`/api/test/session` 的 Playwright 后门额外要求 `NODE_ENV !== "production"`。

## 3. 上线步骤

1. `pnpm db:migrate` 应用 `0060_department_scoped_access.sql`（部门列与索引）与 `0061_email_template_departments.sql`（模板部门覆盖），以及办公类部门面试的 `0062`–`0067`。
2. 确保跨部门管理账号在 Link 里是 `admin`（管理员身份完全来自 Link 角色，People 不再维护本地名单）。
3. 管理员在 `/dashboard/departments` 把存量流程与报名记录分配到部门；`department` 为空的记录对其他部门不可见。归属下拉与概览行都是「Link 部门目录 ∪ 库里已有标识」：目录里的部门即使还没有任何数据也会列出来（0 条）并可直接选择，存量/未知标识继续保留。给流程定归属时，本流程仍未归属的报名记录按报名时的同一口径（组别映射 → 流程归属）**自动跟随**；已经归属过的流程可在「报名记录归属」页一键**「按流程归属回填」**，剩下的都是流程自己也没归属的记录。
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

**面评审批**：部长只看到本部门的面评；管理员看到全部，并可在页面上按部门筛选。

## 5. 界面字段口径

| 界面用词 | 含义 | 来源 |
| --- | --- | --- |
| 所属部门 | 这个人属于哪个部门（决定他能管哪个部门的数据） | Link `profile.department`，People 只读 |
| 投递部门 | 这条报名记录投给了哪个部门（决定评分/面评/排期/邮件的可见范围） | People 的 `user_flow.department`，报名时固化 |
| 归属部门 | 管理员给流程/报名记录指定的部门（`/dashboard/departments`、流程编辑器） | People 的 `flow.department` / `user_flow.department` |

未设置：`所属部门` 为空时显示「未设置部门」；`投递部门`/`归属部门` 为空时显示「未归属部门」（这类数据只有管理员可见）。

**工作台里的「投递部门」只在它没被流程归属隐含时才显示**：部门自有流程下所有候选人都归同一个部门（页签与流程名已经写了），面试与笔试工作台不再逐行重复；共享流程（流程无归属）或候选人与流程归属不一致时才列出来。敏感字段按角色收敛：笔试工作台的候选人 QQ 讲师（role ≥ 2）就能看到（联系候选人用），手机号仍只在部长及以上（role ≥ 3）。
