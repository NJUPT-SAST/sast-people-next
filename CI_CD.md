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
  - 构建 Docker 镜像 → SCP 推送至服务器 → SSH 远程部署
- `release.yml`
  - 在推送 `v*` 标签时创建 GitHub Draft Release

## 触发条件

| 工作流 | 触发 |
|--------|------|
| `ci.yml` | push / PR → `master`、`develop` |
| `deploy.yml` | push → `master`，或手动 `workflow_dispatch` |
| `release.yml` | 推送 `v*` 标签 |

## 部署流程

1. **Quality + Test** — 必须先通过质量检查和测试
2. **Docker Build** — 使用 `Dockerfile` 构建镜像，以 Git commit hash 作为版本标签
3. **SCP Transfer** — 将镜像 tar 文件传输至服务器 `/data/sast-people-next/`
4. **SSH Deploy** — 服务器端加载镜像、轮换 backup/current 标签、`docker compose up -d`

### 部署所需 Secrets

| Secret | 说明 |
|--------|------|
| `SERVER_HOST` | 目标服务器 IP 或域名 |
| `SERVER_USER` | SSH 用户名 |
| `SSH_PRIVATE_KEY` | SSH 私钥 |

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
