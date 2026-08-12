# SAST People v3 用户体系接入 SAST Link 技术方案

| 项目 | 内容 |
| --- | --- |
| 文档状态 | Draft |
| 适用分支 | `v3.1` |
| 适用范围 | SAST People 用户体系改造、Link 接口对接、v3 数据迁移与联调 |
| 最后更新 | 2026-06-04 |
| Link OpenAPI | SAST-Link-Backend OpenAPI，`x-download-time=2026-06-04T03:51:35.694Z` |

## 1. 背景

SAST People 原有用户体系由 People 本地 `public.user` 表维护。SAST Link 也维护了一套用户表，两边存在重复的用户基础信息。v3 改造目标是将重复的用户资料统一到 SAST Link，由 People 仅维护自身业务数据。

本次改造后，People 不再作为用户基础资料的数据源。People 运行时通过 Link API 获取用户资料，并通过 Link API 完成用户角色变更和封禁操作。

## 2. 目标

本次 v3 改造目标如下：

1. People 登录切换为 SAST Link OAuth。
2. People 用户资料读取切换为 Link API。
3. People 用户资料页面改为只读，资料修改跳转至 Link。
4. People 管理端的角色变更和封禁操作切换为 Link API。
5. People 新库仅保留流程、报名、评分、面评、邮件等业务数据。
6. People 业务表中的用户关联字段统一迁移为 Link 用户 ID。
7. 保留本地 mock 和 legacy fallback，用于真实 Link 环境不可用、脱离外部服务本地开发和排障。

## 3. 非目标

以下内容不属于本次 v3 改造范围：

1. People 不实现用户资料编辑能力。
2. People 不直接读取或写入 Link 数据库。
3. People 不负责维护 `college`、`major`、`profile.intro` 等用户资料字段。
4. 本次不立即删除 People 旧 `public.user` 表。
5. 本次不将 v3 直接合入线上主分支。

## 4. 术语

| 术语 | 说明 |
| --- | --- |
| Link 用户 ID | Link `public.user.id`，v3 运行时使用的用户主键 |
| Legacy 用户 ID | 旧 People `public.user.id`，仅用于一次性迁移 |
| `people_legacy_user_map` | 一次性迁移映射表，用于将旧 People 用户 ID 映射到 Link 用户 ID |
| legacy fallback | 本地开发兜底逻辑，在缺少 Link token 时读取旧 People 用户表 |

## 5. 架构边界

### 5.1 SAST Link 负责的数据

Link 作为用户基础资料和账号状态的数据源，负责维护：

| 字段 | 说明 |
| --- | --- |
| `id` | Link 用户 ID |
| `name` | 姓名 |
| `student_id` | 学号 |
| `login_email` | 登录邮箱 |
| `phone_number` | 手机号 |
| `qq_number` | QQ 号 |
| `college` | 学院 |
| `major` | 专业 |
| `role` | 用户角色 |
| `state` | 用户状态 |
| `profile.intro` | 个人简介，对应旧 People `personalStatement` |
| `profile.nickname` | 昵称 |
| `profile.email` | 对外展示邮箱 |
| `profile.github_url` | GitHub 地址 |
| `profile.blog_url` | 博客地址 |
| `profile.avatar` | 头像地址 |
| `profile.department` | 方向或部门 |

### 5.2 SAST People 负责的数据

People v3 仅维护业务数据，包括：

| 模块 | 数据 |
| --- | --- |
| 流程管理 | `flow`、`flow_step`、`problem` |
| 报名 | `user_flow` |
| 阅卷评分 | `user_point` |
| 面评 | `interview_evaluation` |
| 邮件 | `email_template_setting`、`email_batch`、`email_delivery` |
| 错误日志 | People 自身错误日志 |

People 业务表中的用户字段保存 Link 用户 ID。

## 6. 运行时数据流

### 6.1 登录流程

1. 用户在 People 点击 SAST Link 登录。
2. People 跳转到 Link `/oauth/authorize`。
3. Link 完成授权后回调 People `/api/auth/link`。
4. People 调用 Link `/oauth/token` 换取 token。
5. People 调用 Link `/user/profile` 获取当前用户资料。
6. People 创建服务端 session，浏览器 cookie 只保存随机、不透明的 session ID。服务端数据库保存：
   - `uid`: Link 用户 ID
   - `role`: People 内部角色数字
   - `name`: 用户姓名
   - `linkAccessToken`
   - `linkRefreshToken`
   - `linkAccessTokenExpiresAt`

Link OAuth 凭据在写入服务端 session 前使用 AES-GCM 加密，绝不写入 cookie。
`session/expired.cleanup` Inngest 定时任务每天清理已过期的服务端会话记录。

讲师或管理员在一次登录流程中会自动接续管理授权：People 先用最小 scope
识别 Link 身份，再自动请求 `admin:read`、`admin:write`。普通同学和部员只会
获得普通资料 scope，不会收到管理 scope 请求。管理令牌保存为
`linkAdminAccessToken`、`linkAdminRefreshToken` 和
`linkAdminAccessTokenExpiresAt`。普通登录令牌只用于读取当前用户资料，
不会用于 `/admin/*` 接口。

### 6.2 用户资料读取

| 场景 | Link 接口 |
| --- | --- |
| 当前登录用户资料 | `GET /user/profile` |
| 管理端用户列表 | `GET /admin/users`，管理令牌 |
| 管理端用户详情 | `GET /admin/users/{id}`，管理令牌 |
| 根据学号查用户 | `GET /admin/users?keyword={student_id}`，管理令牌后由 People 精确匹配 |

People 读取 Link 返回后，会转换为现有 People UI 使用的 `userType` 视图模型。

### 6.3 用户角色变更

People 管理端角色变更不再更新本地 `public.user.role`，而是调用：

```http
PUT /admin/users/{id}
Content-Type: application/json

{
  "role": "member"
}
```

角色映射关系：

| People role | Link role |
| --- | --- |
| `0` | `freshman` |
| `1` | `member` |
| `2` | `lecturer` |
| `3` | `admin` |

### 6.4 用户封禁

People 管理端封禁用户不再更新本地 `public.user.is_deleted`，而是调用：

```http
DELETE /admin/users/{id}
```

Link 侧预期将 `user.state` 设为 `is_deleted`。

### 6.5 用户资料修改

People 不提供用户资料修改能力。资料页展示为只读，并提供跳转 Link 资料页的入口。

## 7. Link API 依赖

People v3 当前依赖以下 Link API：

| 用途 | 方法 | 路径 | 权限预期 |
| --- | --- | --- | --- |
| OAuth 授权 | `GET` | `/oauth/authorize` | 已登录 Link 用户 |
| OAuth token | `POST` | `/oauth/token` | OAuth client |
| 当前用户资料 | `GET` | `/user/profile` | `user:read` |
| 用户列表 | `GET` | `/admin/users` | `admin:read` |
| 用户详情 | `GET` | `/admin/users/{id}` | `admin:read` |
| 更新用户 | `PUT` | `/admin/users/{id}` | `admin:write` |
| 封禁用户 | `DELETE` | `/admin/users/{id}` | `admin:write` |

### 7.1 People 需要的用户字段

```ts
type LinkUserProfile = {
  id: number;
  name: string;
  login_email?: string | null;
  role: "freshman" | "member" | "lecturer" | "admin";
  state: "njupter" | "on-sast" | "retired-sast" | "is_deleted";
  email_type?: "njupt_email" | "sast_email";
  phone_number?: string | null;
  qq_number?: string | null;
  student_id?: string | null;
  college?: string | null;
  major?: string | null;
  profile?: {
    nickname?: string | null;
    department?: "software" | "media" | null;
    intro?: string | null;
    email?: string | null;
    avatar?: string | null;
    blog_url?: string | null;
    github_url?: string | null;
  } | null;
  identities?: Array<{
    id: number;
    provider: "github" | "lark" | "other_mail";
    provider_id?: string | null;
    identity_data?: Record<string, unknown> | null;
    created_at?: string;
    updated_at?: string;
  }>;
  created_at?: string;
  updated_at?: string;
};
```

### 7.2 当前 Link OpenAPI 状态

根据 MCP 读取到的 Link OpenAPI v3.1（`x-download-time=2026-06-04T03:51:35.694Z`）：

已存在：

- `/oauth/authorize`
- `/oauth/token`
- `/user/profile`
- `/admin/users`
- `/admin/users/{id}`
- `/admin/users/{id}` 的 `PUT`
- `/admin/users/{id}` 的 `DELETE`

v3.1 已确认补齐 People 依赖字段：

| 位置 | 已具备字段 |
| --- | --- |
| `UserProfileResponse.data` | `email_type`、`phone_number`、`qq_number`、`student_id`、`college`、`major`、`profile`、`identities` |
| `AdminUserItem` | `email_type`、`phone_number`、`qq_number`、`college`、`major`、`department` |
| `GET /admin/users` 查询参数 | `page`、`page_size`、`role`、`state`、`department`、`college`、`major`、`keyword` |

因此，当前 Link 接口契约路径和 People v3 依赖字段已具备，后续重点是切换真实接口并完成联调验证。

## 8. 环境变量

`.env.example` 中包含 v3 需要的环境变量：

```env
LINK_CLIENT_ID=
LINK_CLIENT_SECRET=
# Optional dedicated client for admin OAuth. When empty, Link uses LINK_CLIENT_*.
LINK_ADMIN_CLIENT_ID=
LINK_ADMIN_CLIENT_SECRET=
LINK_API_BASE_URL=
LINK_AUTH_BASE_URL=
LINK_OAUTH_SCOPES=openid profile email user:read
LINK_ADMIN_OAUTH_SCOPES=openid profile email user:read admin:read admin:write
LINK_USE_MOCK=false
LINK_ALLOW_LEGACY_FALLBACK=false
PEOPLE_ALLOW_LEGACY_AUTH=false
NEXT_PUBLIC_LINK_PROFILE_URL=
```

### 8.1 本地 mock 模式

真实 Link 环境不可用或需要脱离外部服务做本地开发时，建议使用：

```env
LINK_USE_MOCK=true
LINK_ALLOW_LEGACY_FALLBACK=true
PEOPLE_ALLOW_LEGACY_AUTH=false
```

### 8.2 真实联调模式

真实联调环境建议使用：

```env
LINK_USE_MOCK=false
LINK_ALLOW_LEGACY_FALLBACK=false
PEOPLE_ALLOW_LEGACY_AUTH=false
```

## 9. 数据库迁移方案

### 9.1 v3 数据库原则

v3 使用独立 People 数据库，不直接修改线上原版数据库。

线上原版继续运行当前 master 对应数据库。v3 数据库保留已迁移状态，用于后续真实 Link 接口联调。

### 9.2 表结构迁移

新增迁移文件：

```text
migrations/0011_link_user_ids.sql
```

迁移内容：

- 移除业务表到旧 `public.user` 的外键约束。
- 保留业务表中的用户 id 字段。
- 这些字段后续保存 Link 用户 ID。

涉及字段包括：

- `flow.owner_id`
- `user_flow.fk_user_id`
- `email_batch.fk_created_by`
- `email_delivery.fk_user_id`
- `user_point.fk_judger_id`
- `interview_evaluation.fk_user_id`
- `interview_evaluation.fk_reviewed_by`

### 9.3 数据迁移

新增一次性脚本：

```text
scripts/people-v3-link-user-id-migration.sql
```

脚本依赖映射表：

```sql
create table people_legacy_user_map (
  legacy_user_id integer primary key,
  link_user_id integer not null
);
```

映射表生成逻辑：

```sql
select
  p.id as legacy_user_id,
  u.id as link_user_id
from staging.people_user p
join public."user" u
  on upper(trim(p.student_id)) = upper(trim(u.student_id))
where nullif(trim(p.student_id), '') is not null;
```

本地已完成：

- 创建 `sastpeoplev3`。
- 从 v2 数据复制到 v3。
- 导入 `people_legacy_user_map`。
- 运行一次性迁移脚本。
- 验证业务表用户字段已切换为 Link 用户 ID。

## 10. 代码改造范围

### 10.1 Link 适配层

新增目录：

```text
lib/link/
```

主要文件：

| 文件 | 作用 |
| --- | --- |
| `client.ts` | Link API 请求封装 |
| `oauth.ts` | OAuth token 交换与刷新 |
| `session.ts` | session 中 Link token 读取与刷新 |
| `user.ts` | 当前用户资料 API |
| `admin.ts` | 管理端用户 API |
| `user-lookup.ts` | 按 Link ID 或学号查询用户 |
| `people-user.ts` | Link 用户模型转换为 People 视图模型 |
| `role.ts` | People 角色与 Link 角色映射 |
| `types.ts` | Link API 类型 |
| `mock.ts` | 本地 mock 数据 |

### 10.2 已迁移功能

| 模块 | 状态 |
| --- | --- |
| Link OAuth 登录 | 已改造 |
| 当前用户资料 | 已改造 |
| 用户列表 | 已改造 |
| 用户详情 | 已改造 |
| 改角色 | 已改造 |
| 封禁用户 | 已改造 |
| 用户资料页 | 已改为只读 |
| 报名校验 | 已改造 |
| 按学号查报名 | 已改造 |
| 阅卷成绩列表 | 已改造 |
| 面评列表 | 已改造 |
| 邮件目标和邮件批次 | 已改造 |
| 旧飞书登录 | 生产默认关闭 |
| 测试登录 | 生产默认关闭 |

## 11. 保留旧 `public.user` 的原因

短期内不删除旧 `public.user` 表。

原因：

1. 本地 legacy fallback 仍依赖该表。
2. 真实 Link 环境不可用或联调失败时，该表可用于排查迁移问题。
3. 删除旧表前需要确认所有环境均已关闭 legacy 入口。

后续清理建议：

1. 真实 Link 联调通过。
2. 设置 `LINK_ALLOW_LEGACY_FALLBACK=false`。
3. 设置 `PEOPLE_ALLOW_LEGACY_AUTH=false`。
4. 观察一段时间。
5. 将 `public.user` 改名为 `legacy_user` 或删除。

## 12. 联调计划

Link 契约确认后，按以下顺序联调：

| 阶段 | 验收项 |
| --- | --- |
| OAuth 登录 | 授权跳转、回调、token 保存、session 创建 |
| 当前用户资料 | 姓名、学号、手机号、QQ、学院、专业、简介正常显示 |
| 用户管理 | 分页、搜索、详情、改角色、封禁 |
| 报名 | 普通用户报名、缺字段提示、业务表保存 Link 用户 ID |
| 阅卷 | 按学号查考生、成绩列表展示 |
| 面评 | 候选人列表、评价提交、审批列表 |
| 邮件 | 目标列表、批次生成、测试邮件、发送记录 |

## 13. 风险与处理

| 风险 | 影响 | 处理方式 |
| --- | --- | --- |
| Link 真实返回与 OpenAPI 不一致 | People 页面显示空字段或报名校验失败 | 保持 mock；按 v3.1 OpenAPI 对照真实响应并同步修正 |
| Link 权限不足 | lecturer/admin 页面调用失败 | 确认 `/admin/users` 权限策略 |
| 业务表用户 ID 映射错误 | 报名、阅卷、邮件关联错误 | 使用 `people_legacy_user_map` 抽样校验 |
| 旧登录入口误用 | 继续写旧 People 用户表 | 生产默认关闭 `PEOPLE_ALLOW_LEGACY_AUTH` |
| 过早删除旧 user 表 | fallback 和排障能力丢失 | 暂不删除，联调稳定后再清理 |

## 14. 当前状态

当前状态：

- v3.1 代码正在基于 Link OpenAPI v3.1 更新和联调。
- v3 本地数据库迁移已完成。
- Dependabot 旧 PR 已关闭。
- 线上仍运行原版 People。
- v3 暂不合并上线。

阻塞项：

- 暂无已知接口契约阻塞；需要使用 Link v3.1 真实环境做端到端联调验证。

下一步：

1. 切换 `LINK_USE_MOCK=false` 做真实联调。
2. 验证 OAuth 登录、用户资料读取、管理端列表/详情、角色变更和封禁。
3. 联调通过后再评估是否合并 v3。
