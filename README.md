# SAST People Next

一个基于 **Next.js 16**、**React 19**、**TypeScript** 和 **Tailwind CSS v4** 的 Web 应用。

## 技术栈

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- shadcn/ui
- Jest + Testing Library

## 环境要求

- Node.js 20+
- pnpm 8+

## 快速开始

```bash
pnpm install
pnpm dev
```

默认开发地址为 `http://localhost:3000`。

## 常用命令

```bash
pnpm dev
pnpm dev:mock
pnpm dev:full
pnpm build
pnpm start
pnpm lint
pnpm test
pnpm test:watch
pnpm test:coverage
pnpm exec tsc --noEmit
```

## 项目结构

```text
app/              Next.js App Router 页面与布局
components/       共享组件与业务组件
lib/              通用工具与服务封装
public/           静态资源
mock/             本地 mock 实现
```

## 开发说明

- `next.config.ts` 默认使用 `output: "standalone"`，适合 Web 部署。
- `dev:mock` 会启用仓库内的内存 mock 替代真实数据层依赖。
- `dev:full` 会同时启动 Next.js、Inngest 和邮件预览服务。

## 验证

提交前建议至少执行：

```bash
pnpm lint
pnpm test
pnpm build
```
