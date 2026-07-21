# SAST People 邮件中心设计方案

| 项目 | 内容 |
| --- | --- |
| 版本 | v1 |
| 日期 | 2026-06-06 |
| 适用范围 | SAST People 邮件模板、发送任务、发送记录、测试发送、面试通知和招新结果通知 |
| 目标 | 将所有系统邮件统一收口到邮件中心，业务模块不再直接发送邮件 |

> **信息架构更新（2026-07-21）**：管理员可见导航与主链路见 `docs/email-center-flow-redesign.md`（业务工作台：默认「发结果通知」，四页签，面试邮件仅记录/模板）。本文 §1–4、§6+ 的平台边界与不变量仍有效；§5 五页签布局以 flow-redesign 为准。

## 1. 背景与问题

当前 `/dashboard/emails` 实际承担的是“招新结果邮件发送”页面，但同时塞入了“面试通知模板”配置。页面名称、功能边界和实际能力不一致，导致用户会误以为它能管理所有邮件。

现有实现还有几个结构性问题：

- 结果通知邮件通过 `email_batch` / `email_delivery` 留存批次和投递记录。
- 面试预约、改约、取消邮件在 `action/user-flow/interviewSchedule.ts` 中直接渲染并调用 `sendRawEmail`，没有进入统一邮件记录。
- 测试邮件、结果通知、面试通知的调用方式不统一。
- 模板配置分散在页面弹窗中，缺少统一的模板列表、预览、测试发送入口。
- 发送记录只能覆盖结果通知批次，不能回答“某个同学是否收到过面试通知”。
- 业务模块知道过多邮件细节，例如 subject、HTML 渲染、SMTP 发送方式。

邮件中心必须成为平台级能力：所有涉及邮件的业务都只提交邮件请求，由邮件中心完成模板、渲染、快照、入队、发送、记录和重试。

## 2. 设计原则

1. **单一出口**
   所有邮件必须经由邮件中心服务层。业务模块禁止直接调用 SMTP、`sendRawEmail`、React Email `render` 或具体模板组件。

2. **可追踪**
   每一封邮件必须有投递记录，包含收件人、主题、模板、状态、失败原因、正文快照、关联业务对象。

3. **快照不可变**
   邮件发出前保存 `subject` 和 `htmlSnapshot`。后续模板变更不能影响历史邮件内容。

4. **模板和发送解耦**
   模板负责内容结构，发送任务负责收件人和业务上下文。业务模块只传变量，不拼 HTML。

5. **失败可恢复**
   邮件发送失败必须落库，并能从邮件中心重试。不能只依赖 toast 或 server log。

6. **UI 面向操作**
   邮件中心不是数据库表查看器。页面必须围绕管理员的常见任务组织：看状态、发通知、改模板、查失败、重试、核对正文。

## 3. 功能边界

### 3.1 邮件中心负责

- 邮件模板注册和展示
- 模板变量定义、默认值、校验
- 邮件预览和测试发送
- 创建单封投递记录
- 创建批量发送任务
- 渲染 subject 和 HTML
- 保存正文快照
- 入队发送
- SMTP 实际发送
- 更新发送状态
- 失败原因记录
- 重试和恢复中断任务
- 邮件发送审计

### 3.2 业务模块负责

- 决定业务事件是否需要邮件通知
- 提供业务变量，例如姓名、流程名、面试时间、地点
- 提供关联对象 ID，例如 flowId、userFlowId、scheduleId
- 展示业务侧操作结果，例如“已创建面试预约”

### 3.3 业务模块不负责

- 选择 SMTP transporter
- 直接调用 `sendRawEmail`
- 手动 `render` React Email 模板
- 自行保存邮件快照
- 自行维护发送状态
- 自行实现邮件重试

## 4. 邮件类型

第一阶段必须覆盖以下邮件：

| category | templateKey | 触发场景 | 发送方式 |
| --- | --- | --- | --- |
| `result` | `recruitment.result.accepted` | 招新通过结果通知 | 批量 |
| `result` | `recruitment.result.rejected` | 招新不通过结果通知 | 批量 |
| `interview` | `interview.schedule.created` | 面试预约创建 | 单封 |
| `interview` | `interview.schedule.rescheduled` | 面试改约 | 单封 |
| `interview` | `interview.schedule.cancelled` | 面试取消 | 单封 |
| `test` | 任意模板 + `.test` 标记 | 管理员测试发送 | 单封 |

当前已有的 `interview.schedule` 可以作为兼容 key，但新设计建议拆成三个明确模板 key。三种状态可以共享 React Email 组件，但模板注册层需要暴露独立条目，方便预览、测试和文案管理。

## 5. UI 信息架构

导航名称使用 `邮件中心`。页面顶部说明：

> 统一管理系统邮件模板、发送任务和发送记录。招新结果通知、面试通知和测试邮件都从这里追踪。

页面使用 tab 结构：

```text
邮件中心
├─ 概览
├─ 发送任务
├─ 发送记录
├─ 模板管理
└─ 配置
```

### 5.1 概览

目标：让管理员快速判断邮件系统是否健康。

内容：

- 今日发送总数
- 今日失败数
- 待发送数
- 发送中数
- 最近失败原因 Top 5
- 最近 5 个发送任务
- 邮件服务配置状态，例如 SMTP 是否配置、队列是否可用

UI：

- 顶部 4 个指标卡，紧凑排列。
- 下方左右两栏：最近任务、最近失败。
- 移动端改为单列堆叠。

空状态：

- 没有发送记录：显示“暂无邮件发送记录”，并引导到模板测试或结果通知发送。

### 5.2 发送任务

目标：管理批量邮件任务。

当前第一阶段只支持结果通知批量任务，但 UI 名称不写死“结果邮件”。

结构：

- 左侧：流程列表和搜索。
- 右侧：当前流程下的通知任务。
- 每个任务分为“通过通知”和“不通过通知”。

主要操作：

- 查看待通知名单
- 预览邮件样张
- 创建发送任务
- 发送任务
- 重试失败
- 恢复中断

状态：

- `draft`：已创建任务但未发送
- `queued`：已入队
- `sending`：投递中
- `completed`：全部成功
- `failed`：存在失败
- `partial`：部分成功、部分失败，当前可以由统计计算，不一定要做数据库枚举

### 5.3 发送记录

目标：查所有邮件，而不是只查结果通知。

筛选：

- 邮件类型：结果通知、面试通知、测试邮件
- 模板
- 状态：待发送、发送中、成功、失败
- 流程
- 收件人
- 创建人
- 时间范围

表格列：

- 状态
- 类型
- 主题
- 收件人
- 关联对象
- 创建时间
- 发送时间
- 创建人
- 操作

行操作：

- 查看正文快照
- 查看失败原因
- 重试
- 复制收件地址
- 跳转关联业务对象，例如流程、报名记录、面试预约

移动端：

- 使用列表卡片，不展示宽表。
- 卡片第一行显示状态、类型、时间。
- 第二行显示主题和收件人。
- 操作折叠到菜单或底部按钮组。

### 5.4 模板管理

目标：统一编辑、预览、测试所有模板。

列表列：

- 模板名称
- 类型
- 状态
- 可用变量摘要
- 最近修改时间
- 操作

模板操作：

- 编辑
- 预览
- 测试发送
- 恢复默认

模板编辑 UI 原则：

- 不用双栏挤压输入框。
- 主编辑区域单栏，保证输入宽度。
- 变量提示只作为辅助，不占据主要空间。
- 复杂变量说明用折叠区域或 hover/tooltip。
- 预览在独立弹窗或右侧抽屉中显示，不和编辑字段挤在同一个窄弹窗里。

面试模板编辑建议：

- 标题字段：邮件标题、邮件主标题
- 正文字段：开头说明
- 落款字段：组织落款
- 说明文案：时间、地点、讲师、备注和参会入口会自动生成到信息卡片里。

### 5.5 配置

第一阶段只展示只读配置状态：

- SMTP host
- 发件人
- 测试收件人
- 队列状态
- 生产环境是否启用真实收件人

敏感信息不展示明文。

## 6. 数据模型设计

### 6.1 现有表处理

保留现有表，渐进扩展：

- `email_template_content`：模板内容表，继续使用。
- `email_template_setting`：结果通知链接配置，短期保留；长期并入模板配置模型。
- `email_batch`：从“结果邮件批次”扩展为通用邮件任务。
- `email_delivery`：从“结果邮件投递”扩展为所有邮件投递记录。

### 6.2 email_batch 扩展

建议新增字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `category` | varchar(32) | `result` / `interview` / `test` |
| `template_key` | varchar(80) | 已有，继续使用 |
| `name` | varchar(255) | 任务名称 |
| `status` | enum | 继续使用现有状态 |
| `total_count` | integer | 已有 |
| `fk_flow_id` | integer nullable | 关联流程，可为空 |
| `fk_created_by` | integer nullable | 已有 |
| `metadata` | jsonb | 额外上下文 |

现有 `accept` 字段是结果通知特有字段。长期建议迁移到 `metadata.accept` 或新增 `variant` 字段。短期可以保留，避免一次性重构过大。

### 6.3 email_delivery 扩展

建议新增字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `category` | varchar(32) | 邮件类型 |
| `template_key` | varchar(80) | 模板 key |
| `fk_email_batch_id` | integer nullable | 单封业务邮件可以为空或挂到自动批次 |
| `fk_flow_id` | integer nullable | 关联流程 |
| `fk_user_flow_id` | integer nullable | 已有，继续使用 |
| `fk_user_id` | integer nullable | 当前非空，后续测试邮件可能为空 |
| `related_schedule_id` | integer nullable | 面试预约 ID |
| `created_by` | integer nullable | 触发人 |
| `metadata` | jsonb | 变量、业务上下文、测试标记 |

需要注意：当前 `fkUserId` 是 not null。测试邮件或外部联系人不一定有 Link 用户 ID。第一阶段可以继续给测试邮件使用当前登录用户 ID；长期应改为 nullable。

## 7. 模板注册设计

新增模板注册表或静态 registry：

```ts
export type EmailTemplateDefinition = {
  key: string;
  category: "result" | "interview" | "test";
  name: string;
  description: string;
  variables: EmailVariableDefinition[];
  defaultSubject: string;
  defaultTitle?: string;
  defaultBody?: string;
  render: (input: EmailRenderInput) => Promise<RenderedEmail>;
};
```

变量定义：

```ts
export type EmailVariableDefinition = {
  key: string;
  label: string;
  required: boolean;
  example: string;
  description?: string;
};
```

注册示例：

```ts
export const emailTemplates = [
  {
    key: "interview.schedule.created",
    category: "interview",
    name: "面试预约通知",
    variables: [
      { key: "candidateName", label: "候选人姓名", required: true, example: "张三" },
      { key: "flowName", label: "流程名称", required: true, example: "2026 免试招新" },
      { key: "startsAt", label: "开始时间", required: true, example: "2026-06-06 16:00" },
      { key: "location", label: "地点", required: false, example: "大学生活动中心 101" },
    ],
    render: renderInterviewScheduleEmailByTemplate,
  },
];
```

## 8. 服务层 API 设计

新增目录：

```text
lib/email-center/
├─ types.ts
├─ registry.ts
├─ render.ts
├─ create-delivery.ts
├─ create-batch.ts
├─ enqueue.ts
├─ send.ts
├─ retry.ts
└─ query.ts
```

### 8.1 创建单封邮件

```ts
await createEmailDelivery({
  templateKey: "interview.schedule.created",
  to: attendeeEmail,
  recipientUserId: candidateId,
  variables: {
    candidateName,
    flowName,
    organizerName,
    startsAt,
    endsAt,
    location,
    meetingLink,
    scheduleLink,
  },
  related: {
    flowId,
    userFlowId,
    scheduleId,
  },
  createdBy: session.uid,
  sendImmediately: true,
});
```

行为：

1. 校验模板存在。
2. 校验必填变量。
3. 渲染 subject 和 HTML。
4. 创建 `email_delivery`。
5. 如果 `sendImmediately` 为 true，则入队或直接 fallback 发送。
6. 返回 deliveryId。

### 8.2 创建批量任务

```ts
await createEmailBatch({
  templateKey: "recruitment.result.accepted",
  name: "2026 免试招新 通过通知",
  recipients,
  variablesFor: (recipient) => ({
    candidateName: recipient.name,
    flowName,
  }),
  related: {
    flowId,
  },
  createdBy: session.uid,
});
```

行为：

1. 创建 `email_batch`。
2. 为每个收件人创建 `email_delivery`。
3. 每封邮件保存独立 HTML 快照。
4. 不自动发送，除非调用方指定 `sendImmediately`。

### 8.3 发送与重试

```ts
await enqueueEmailDelivery(deliveryId);
await sendEmailDelivery(deliveryId);
await retryEmailDelivery(deliveryId);
await retryEmailBatch(batchId);
```

`sendEmailDelivery` 是唯一允许调用 SMTP 的地方。

## 9. 调用改造点

### 9.1 必须迁移

| 当前位置 | 当前行为 | 新行为 |
| --- | --- | --- |
| `action/user/sendEmail.ts` | 创建结果邮件批次和投递 | 改为 `emailCenter.createBatch` |
| `action/email/send.ts` | 发送结果邮件批次 | 改为 `emailCenter.retryBatch/sendBatch` |
| `queue/sendEmail.tsx` | SMTP 实际发送 | 保留为底层 delivery sender，但移动到邮件中心 |
| `action/user-flow/interviewSchedule.ts` | 直接 render + `sendRawEmail` | 改为 `emailCenter.createDelivery` |
| `action/email/test-send.ts` | 发送测试邮件 | 改为 `emailCenter.createDelivery(category: "test")` |

### 9.2 禁止新增

后续业务代码不允许新增：

```ts
sendRawEmail(...)
render(<SomeEmail />)
createTransport(...)
```

可以通过 lint 规则或代码 review 约束。短期可以通过 `rg "sendRawEmail|createTransport|@react-email/render"` 检查。

## 10. 权限设计

| 功能 | 最低角色 |
| --- | --- |
| 查看邮件中心 | 管理员 role >= 3 |
| 查看发送记录 | 管理员 role >= 3 |
| 查看正文快照 | 管理员 role >= 3 |
| 编辑模板 | 管理员 role >= 3 |
| 测试发送 | 管理员 role >= 3 |
| 创建结果通知任务 | 管理员 role >= 3 |
| 重试失败邮件 | 管理员 role >= 3 |

讲师 role 2 不直接进入邮件中心。讲师触发面试预约时，邮件由业务 action 代为创建，但记录归邮件中心保存。

## 11. UI 细节规范

### 11.1 页面整体

- 页面标题：`邮件中心`
- 顶部说明：简短说明覆盖范围，不写过宽泛口号。
- Tabs 使用持久 URL query，例如 `/dashboard/emails?tab=records`。
- 表格默认高密度但不过度拥挤。
- 主要动作按钮放在当前 tab 右上角。
- 危险操作和重试操作必须有明确状态反馈。

### 11.2 模板编辑弹窗

避免当前问题：

- 不使用左右栏挤压输入框。
- 不把所有变量以大段技术文本堆在顶部。
- 不让模板正文承担自动信息卡片的内容。

推荐结构：

```text
编辑模板
说明：时间、地点、讲师和参会入口会自动生成。

[邮件标题]
[邮件主标题]
[开头说明 textarea]
[落款]

提示：正文建议保留 {candidateName} 和 {flowName}

[恢复默认] [预览] [保存]
```

### 11.3 发送记录详情

详情弹窗分三段：

1. 投递信息：状态、收件人、模板、创建时间、发送时间。
2. 关联对象：流程、候选人、面试预约。
3. 正文快照：iframe 预览。

失败时顶部显示失败原因和“重试”按钮。

## 12. 迁移计划

### Phase 0：停止继续扩大旧页面

- 当前 `/dashboard/emails` 只做必要 bug 修复。
- 页面文案可先改为 `招新通知`，避免误导。
- 完成本文档并作为后续实现依据。

### Phase 1：服务层抽象

- 新增 `lib/email-center/*`。
- 把 SMTP 发送集中到 `sendEmailDelivery`。
- 保留现有 `email_batch/email_delivery` 行为。
- 结果通知发送改为使用新服务层，但 UI 不大改。

### Phase 2：面试邮件接入记录

- 面试预约、改约、取消邮件改为 `createEmailDelivery`。
- 所有面试邮件进入 `email_delivery`。
- 发送失败后业务 action 能返回明确错误，同时邮件中心有失败记录。

### Phase 3：页面重构

- `/dashboard/emails` 改为 `邮件中心`。
- 新增 tabs：概览、发送任务、发送记录、模板管理、配置。
- 当前结果通知 UI 移入发送任务。
- 当前模板弹窗移入模板管理。
- 发送记录支持 category/template/status 筛选。

### Phase 4：数据模型完善

- 为 `email_batch/email_delivery` 增加 category、templateKey、related IDs、metadata 等字段。
- 迁移历史结果邮件记录。
- 调整 `fkUserId` nullable 策略，支持测试邮件和非用户收件人。

### Phase 5：质量和约束

- 增加邮件中心单元测试。
- 增加关键 action 的集成测试。
- 增加 lint/code review 检查，禁止业务层直接发送邮件。
- 完善错误恢复和队列健康检查。

## 13. 风险与处理

| 风险 | 处理 |
| --- | --- |
| 一次性重构过大 | 分 phase，先抽服务层，再改 UI |
| 历史结果邮件记录兼容 | 保留现有字段，新增字段 nullable |
| 面试邮件发送失败影响预约流程 | 先创建预约，再创建邮件记录；邮件失败要记录并给出可重试入口 |
| 模板变量不一致 | 模板 registry 统一定义变量和校验 |
| 测试邮件污染正式记录 | 使用 category `test` 和 metadata 标记 |
| 敏感信息泄露 | 邮件中心不展示 SMTP 密码，不在日志输出 HTML 全文 |

## 14. 第一批实现清单

建议最先实现：

1. 新增 `lib/email-center/types.ts` 和 `registry.ts`。
2. 新增 `createEmailDelivery`，支持单封邮件记录。
3. 将 `sendRawEmail` 封装为 `sendEmailDelivery`。
4. 改造面试预约邮件走 `createEmailDelivery`。
5. 扩展发送记录查询，能看到面试邮件。
6. 将页面改名为 `邮件中心`，保留旧 UI 但增加 `发送记录` 覆盖所有邮件。

这批完成后，系统才真正满足“所有涉及邮件的都走邮件中心”的底线。
