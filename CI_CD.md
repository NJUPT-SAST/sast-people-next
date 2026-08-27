# CI/CD

CI/CD 包含代码质量检查、测试、以及 Docker 镜像构建与部署。

## 工作流概览

- `quality.yml`
  - ESLint
  - TypeScript 检查
- `test.yml`
  - Jest 测试
  - PostgreSQL 集成测试
  - Next.js 构建验证
  - Playwright 端到端测试
- `ci.yml`
  - 编排 `quality` 与 `test`
- `deploy.yml`
  - 手动构建应用与 migration Docker 镜像 → 推送私有 TCR → SSH 远程迁移并部署
- `release.yml`
  - 在推送 `v*` 标签时创建 GitHub Draft Release

## 触发条件

| 工作流 | 触发 |
|--------|------|
| `ci.yml` | Pull Request |
| `deploy.yml` | 手动 `workflow_dispatch` |
| `release.yml` | 推送 `v*` 标签 |

手动触发 `deploy.yml` 时可填写外部生产数据库备份/快照编号作为审计标签；留空时部署会在服务器 `/data/sast-people-next/backups` 自动创建并校验一份 PostgreSQL custom-format 逻辑备份，自动生成编号。备份创建或校验失败会阻止迁移和应用切换。

## 部署流程

1. **Quality + Test** — 必须先通过质量检查和测试
2. **Docker Build** — 使用同一个 Git commit 构建应用镜像和一次性 migration 镜像
3. **Private Registry Pull** — 服务器从 TCR 拉取两个镜像，数据库凭据仍只存在服务器 `.env`
4. **Database Backup** — 在服务器服务目录自动创建并校验 PostgreSQL custom-format 逻辑备份；可选输入仅作为外部快照审计标签
5. **Database Migration** — 使用 migration 镜像、生产 `.env` 和内网 `postgres` Docker network 执行 `pnpm db:migrate`
6. **Application Deploy** — 只有迁移和权限检查成功后才轮换 `backup/current` 标签并执行 `docker compose up -d`
7. **Health Check / Rollback** — 健康检查失败时回滚应用镜像；数据库迁移不自动回滚

### 部署所需 Secrets

| Secret | 说明 |
|--------|------|
| `SERVER_HOST` | 目标服务器 IP 或域名 |
| `SERVER_USER` | SSH 用户名 |
| `SSH_PRIVATE_KEY` | SSH 私钥 |
| `SSH_HOST_FINGERPRINT` | 部署服务器 SSH 主机公钥的 SHA256 指纹 |
| `NEXT_PUBLIC_SENTRY_DSN` | 构建期公开 Sentry DSN，会被 Next.js inline 到前端产物 |
| `SENTRY_AUTH_TOKEN` | 可选；配置后 CI 构建会启用 Sentry build plugin |

生产运行时变量不再由 GitHub Actions 写入。它们由服务器上的 `/data/sast-people-next/.env` 管理，并通过 `docker-compose.yml` 的 `env_file` 注入容器。

如果只修改运行时变量，例如数据库、会话密钥、飞书密钥或邮箱密码，不需要重新构建镜像，也不需要 SCP 镜像 tar：

```bash
cd /data/sast-people-next
vim .env
chmod 600 .env
docker compose up -d --force-recreate
```

如果修改 `NEXT_PUBLIC_*` 变量，需要重新构建部署，因为 Next.js 会在 `pnpm build` 时把它们写入前端产物。

本地构建默认不启用 Sentry build plugin，避免在未配置 Sentry CLI 时出现可选构建后 warning。需要验证 Sentry 构建期处理时设置 `SENTRY_BUILD_PLUGIN=true`。

## 数据库迁移规范

生产迁移由 `deploy.yml` 在应用切换前自动执行，不再通过数据库软件手工复制 SQL。migration 镜像和应用镜像来自同一个 commit，运行时使用服务器上的 `/data/sast-people-next/.env`，并仅通过 Docker 内网访问数据库。

生产数据库必须配置独立的 migration 发布账号，并在服务器 `.env` 中设置 `DATABASE_MIGRATION_URL`；migration image 未配置该变量会直接拒绝执行。应用运行账号 `sastpeople` 不应拥有执行 DDL 的权限；应用继续使用 `DATABASE_URL`。迁移前应完成数据库备份或快照；迁移文件必须采用向后兼容的 expand/contract 方式，删除字段或表等不可逆变更需要拆分发布。

如果迁移失败，部署会在应用镜像激活前终止；如果迁移成功但应用健康检查失败，只回滚应用镜像，数据库不会自动回滚，因此每次迁移都必须兼容上一版本应用。

## 镜像版本管理

每次部署生成两个标签：
- `sast/sast-people-next:latest` — 临时标签，部署后清理
- `sast/sast-people-next:<commit-hash>` — 永久版本标签

服务器上维护两个滚动标签：
- `current` — 当前运行版本
- `backup` — 上一版本（用于快速回滚）

回滚命令：`docker tag sast/sast-people-next:backup sast/sast-people-next:current && docker compose up -d`

## 本地建议

推送前建议至少运行：

```bash
pnpm lint
pnpm test
pnpm build
```

## 依赖更新

Dependabot 当前负责：

- 根目录 npm/pnpm 依赖
- GitHub Actions 依赖
