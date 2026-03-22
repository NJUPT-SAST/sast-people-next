# CI/CD

当前仓库的 CI/CD 聚焦于 Web 应用质量保障，不再包含桌面打包流程。

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
- `release.yml`
  - 在推送 `v*` 标签时创建 GitHub Draft Release

## 触发条件

- 推送到 `master` 或 `develop`
- 向 `master` 或 `develop` 发起 PR
- 推送版本标签，如 `v1.0.0`

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
