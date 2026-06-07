# CI/CD

CI/CD 包含代码质量检查、测试、以及 Docker 镜像构建与部署。

## 工作流概览

- `quality.yml`
  - ESLint
  - TypeScript 检查
  - 依赖审计
- `test.yml`
  - Jest 测试
  - 覆盖率产物
  - Next.js 构建验证
- `ci.yml`
  - 编排 `quality` 与 `test`
- `deploy.yml`
  - 手动构建 Docker 镜像 → SCP 推送至服务器 → SSH 远程部署
- `release.yml`
  - 在推送 `v*` 标签时创建 GitHub Draft Release

## 触发条件

| 工作流 | 触发 |
|--------|------|
| `ci.yml` | push / PR → `master`、`develop` |
| `deploy.yml` | 手动 `workflow_dispatch` |
| `release.yml` | 推送 `v*` 标签 |

## 部署流程

1. **Quality + Test** — 必须先通过质量检查和测试
2. **Docker Build** — 使用 `Dockerfile` 构建镜像，以 Git commit hash 作为版本标签
3. **SCP Transfer** — 将镜像 tar 文件传输至服务器 `/data/sast-people-next/`
4. **Runtime Env Check** — 检查服务器 `/data/sast-people-next/.env` 是否存在
5. **SSH Deploy** — 服务器端加载镜像、轮换 backup/current 标签、`docker compose up -d`

### 部署所需 Secrets

| Secret | 说明 |
|--------|------|
| `SERVER_HOST` | 目标服务器 IP 或域名 |
| `SERVER_USER` | SSH 用户名 |
| `SSH_PRIVATE_KEY` | SSH 私钥 |
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
