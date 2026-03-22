# Contributing

感谢你为 `sast-people-next` 做贡献。

## 环境准备

- Node.js 20+
- pnpm 8+

安装依赖并启动开发环境：

```bash
pnpm install
pnpm dev
```

## 常用命令

```bash
pnpm lint
pnpm test
pnpm test:watch
pnpm test:coverage
pnpm build
pnpm exec tsc --noEmit
```

## 开发约定

- 使用 TypeScript。
- 组件优先保持小而可复用。
- 样式优先使用 Tailwind 工具类。
- 内部模块统一使用 `@/` 路径别名。

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

- 变更范围保持聚焦
- 必要时补充或更新测试
- 文档与行为保持一致
- 本地至少通过 `pnpm lint` 与相关验证
