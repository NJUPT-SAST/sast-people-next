# 发布与预发联调清单

| 项目 | 内容 |
| --- | --- |
| 日期 | 2026-07-21 |
| 适用范围 | SAST People v3.1 上线前验收与预发外部服务联调 |
| 相关分支 | `v3.1` 及已合入的邮件中心 / 招新 E2E / 安全加固提交 |

本清单覆盖本地可自动化验收之外、仍需人工确认的发布前工作。  
真正调用预发/生产外部服务前，必须确认目标环境、账号范围和副作用范围。

## 1. 代码与 CI 门禁

- [ ] 目标分支质量检查通过：`pnpm lint`、`pnpm exec tsc --noEmit`
- [ ] 单元测试通过：`pnpm test`
- [ ] 生产构建通过：`pnpm build`
- [ ] E2E 通过：`pnpm test:e2e`
  - 邮件中心管理员页与 webhook 鉴权
  - 学生报名 → 落库 → 页面展示
  - 管理员成绩管理设为通过
  - 管理员面评终审通过
  - 关键页桌面/移动端视觉冒烟（无横向溢出）
- [ ] GitHub Actions `quality.yml` / `test.yml` 在目标分支绿灯
  - Lint 失败必须阻断
  - 临时 PostgreSQL + migrate + seed + Playwright 已执行

## 2. 数据库

- [ ] 目标环境执行 `pnpm db:migrate`
- [ ] 确认邮件中心相关迁移已应用，至少到 `0026_email_center_production_hardening`
- [ ] 确认关键表与字段存在：
  - `email_delivery.fk_flow_id`（nullable）
  - `email_delivery.idempotency_key` / `next_retry_at` / `dead_lettered_at`
  - `email_send_rate_limit`
  - `interview_schedule.location`
- [ ] 预发演练迁移与回滚说明已记录
- [ ] 演示种子数据仅用于预发演示，不写入生产

## 3. 环境变量与密钥

服务端私密配置只放运行环境，不写入仓库、日志或 `NEXT_PUBLIC_*`。

### 3.1 必填

- [ ] `DATABASE_URL`
- [ ] `SESSION_SECRET`（足够强度的随机值）
- [ ] `LINK_CLIENT_ID` / `LINK_CLIENT_SECRET`
- [ ] `LINK_API_BASE_URL` / `LINK_AUTH_BASE_URL`
- [ ] `EMAIL_SMTP_HOST` / `EMAIL_SMTP_PORT` / `EMAIL_SMTP_USER` / `EMAIL_PASSWORD` / `EMAIL_FROM`
- [ ] `EMAIL_WEBHOOK_SECRET`
- [ ] 飞书相关：`APP_ID` / `APP_SECRET` / `FEISHU_OAUTH_REDIRECT_URI` / 事件校验配置

### 3.2 生产安全开关

- [ ] `LINK_USE_MOCK=false`
- [ ] `LINK_LOGIN_FEISHU_TEST_MOCK=false`
- [ ] `LINK_ALLOW_LEGACY_FALLBACK=false`
- [ ] `PEOPLE_ALLOW_LEGACY_AUTH=false`
- [ ] 非生产邮件确认 `EMAIL_TEST_RECIPIENT` 指向安全收件人
- [ ] 生产真实收件模式确认无误（不要误用测试收件人）

### 3.3 建议配置

- [ ] `EMAIL_SEND_RATE_LIMIT_PER_MINUTE`
- [ ] `EMAIL_RETRY_MAX_ATTEMPTS` / `EMAIL_RETRY_*`
- [ ] `EMAIL_ATTEMPT_RETENTION_DAYS`
- [ ] `PEOPLE_PUBLIC_BASE_URL`
- [ ] `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`（如启用）
- [ ] Inngest 运行所需密钥与 worker 部署

## 4. 预发外部服务联调

执行前确认：目标为预发环境，不会误触真实招新用户群或生产邮件列表。

### 4.1 SAST Link

- [ ] OAuth 登录成功，session 写入正确
- [ ] 用户资料读取正常
- [ ] 管理员用户列表/角色同步正常
- [ ] 招新通过后的角色升级可在 Link 侧观察

### 4.2 飞书

- [ ] OAuth 绑定成功，redirect URI 与控制台完全一致
- [ ] 面试日程创建/改约/取消在测试日历可见
- [ ] 事件回调验签与重试可处理
- [ ] 群通知（如启用 `FEISHU_INTERVIEW_CHAT_ID`）内容不泄露无关隐私

### 4.3 邮件中心 / SMTP

- [ ] 配置页生产就绪检查全部通过
- [ ] 测试发送到达 `EMAIL_TEST_RECIPIENT`
- [ ] 结果通知批次创建、发送、失败重试链路可用
- [ ] provider webhook 鉴权失败返回 401，成功可更新投递状态
- [ ] 非生产环境不会把邮件发到真实候选人

### 4.4 Inngest / 后台任务

- [ ] worker 在线
- [ ] 到期自动重试可触发
- [ ] 尝试日志清理任务可运行
- [ ] 失败任务可定位 delivery id / batch id

## 5. 业务手工走查

至少覆盖三种角色：新同学、讲师、管理员。

### 5.1 权限

- [ ] 新同学只看到个人资料和我的流程
- [ ] 讲师看到阅卷、成员目录、成绩管理
- [ ] 管理员看到完整管理菜单
- [ ] 讲师看不到手机号和 QQ；管理员可以看到

### 5.2 笔试招新

- [ ] 报名后人员立即出现在成绩管理
- [ ] 可设置通过/不通过
- [ ] 邮件发送前可调整名单
- [ ] 结果邮件发送后名单锁定
- [ ] 通过邮件成功后角色升级为部员

### 5.3 非笔试流程

- [ ] 讲师可提交面评
- [ ] 管理员可终审通过/驳回
- [ ] 最终状态与角色同步一致

### 5.4 UI 验收

- [ ] 桌面端关键页无明显横向溢出
- [ ] 移动端关键页无明显横向溢出
- [ ] 操作使用按钮，状态颜色可区分
- [ ] favicon 使用项目自定义图标
- [ ] 面试通知邮件模板排版在主流客户端可读

## 6. 发布与回滚

- [ ] 发布说明包含迁移步骤、环境变量变更、验证步骤
- [ ] 部署顺序：迁移 → 应用发布 → worker/配置确认
- [ ] 回滚方案明确：
  - 应用回滚到上一稳定镜像/提交
  - 数据库仅回滚兼容的变更；不可逆迁移需提前标注
- [ ] 发布后观察：
  - 登录成功率
  - 邮件发送失败率
  - 5xx / Sentry 错误
  - Inngest 失败任务

## 7. 本地快速复验命令

```powershell
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm build
pnpm test:e2e
```

需要隔离数据库时：

```powershell
pnpm db:migrate
pnpm db:seed:demo
pnpm test:e2e
```

## 8. 当前自动化已覆盖

| 能力 | 证据 |
| --- | --- |
| Lint 阻断 CI | `.github/workflows/quality.yml` |
| 单测 + 构建 + Playwright | `.github/workflows/test.yml` |
| CI 临时 Postgres + migrate + seed | `test.yml` services + `pnpm db:migrate` + `pnpm db:seed:demo` |
| 邮件中心 smoke | `e2e/email-center.spec.ts` |
| 招新报名 / 通过 / 面评终审 | `e2e/recruitment-flow.spec.ts` |
| 关键页桌面/移动溢出检查 | `e2e/visual-smoke.spec.ts` |
| 敏感运维日志脱敏 | 历史提交 `fix(security): redact sensitive operational logs` |

仍需人工确认的部分集中在第 2–6 节外部依赖与真实环境配置。

## 7. 本地自动化验收记录（开发机）

| 日期 | 命令 | 结果 |
| --- | --- | --- |
| 2026-07-21 | `pnpm test:e2e -- e2e/recruitment-flow.spec.ts e2e/visual-smoke.spec.ts` | 19 passed |
| 2026-07-21 | `pnpm test:e2e -- e2e/email-center.spec.ts` | 2 passed |
| 2026-07-21 | `pnpm exec eslint` (changed files) | passed |
| 2026-07-21 | `pnpm exec tsc --noEmit` | passed |
| 2026-07-21 | `pnpm test` | 135 passed |
| 2026-07-21 | `pnpm build` | passed |
| 2026-07-21 | GitHub Actions on PR #121 (commit f29b7ca) | Quality + Test/E2E/Build + GitGuardian passed |

说明：上述结果仅证明本地可自动化路径可用，不能替代目标预发环境的迁移、密钥、外部服务联调和业务走查。


