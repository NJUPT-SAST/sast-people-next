# Contributing

感谢你为 `sast-people-next` 做贡献。

更完整的项目说明见 [README.md](README.md)。测试细节见 [TESTING.md](TESTING.md)，发布与部署见 [CI_CD.md](CI_CD.md) 和 [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)。

## 环境准备

- Node.js 20+
- pnpm 8+
- Docker（推荐，用于本地 PostgreSQL）或本机 PostgreSQL 14+

安装依赖并准备本地环境：

```bash
pnpm install
cp .env.example .env.local
pnpm db:dev:up
pnpm db:migrate
pnpm db:seed:local
pnpm db:seed:demo
pnpm dev
```

推荐的 Docker 数据库连接串：

```env
DATABASE_URL=postgres://sastpeople:sast_dev_password@localhost:55432/sastpeople_local
SESSION_SECRET=replace-with-a-long-random-string
LINK_ALLOW_LEGACY_FALLBACK=false
PEOPLE_ALLOW_LEGACY_AUTH=false
```

## 常用命令

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm test:watch
pnpm test:coverage
pnpm test:e2e
pnpm build
pnpm dev:full
```

## 开发约定

- 使用 TypeScript，优先表达真实业务约束。
- 组件优先保持小而可复用；客户端组件尽量下沉到交互边界。
- 样式优先使用 Tailwind 工具类和现有 shadcn/ui 组件。
- 内部模块统一使用 `@/` 路径别名。
- 身份、权限、密钥和数据库访问必须留在服务端边界内。
- 用户身份与资料以 SAST Link 为准；不要把 People 旧 `user` 表当主数据源。

## 提交规范

推荐使用 Conventional Commits：

```text
feat: ...
fix: ...
docs: ...
refactor: ...
test: ...
chore: ...
ci: ...
```

## Pull Request 检查项

- 变更范围保持聚焦，不混入无关重构
- 行为变更同步更新 README / docs / schema 说明
- 必要时补充或更新 Jest / Playwright 测试
- 本地至少通过：

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
```

涉及关键用户路径、邮件中心、招新流程或权限边界时，再补：

```bash
pnpm test:e2e
pnpm build
```
