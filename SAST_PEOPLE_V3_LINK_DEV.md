# SAST People v3 与 SAST Link 对接开发说明

本文档用于说明 `sast-people-v3` 分支的用户体系改造、数据库迁移、环境配置和后续联调事项。它不是严格意义上的 PRD，更接近技术对接说明和维护手册。

## 当前结论

- 线上当前继续运行原版 People，不合并 v3。
- `sast-people-v3` 分支先保留，等待 Link 后端真实接口补齐后再联调。
- People v3 不再直接维护用户资料。用户基础资料、登录、角色和账号状态以 Link 为准。
- People v3 自己维护流程、报名、评分、面评、邮件等业务数据。
- v3 数据库已经完成本地迁移，业务表中的用户 id 已迁为 Link 用户 id。

## 系统边界

### Link 负责

- 用户登录和 OAuth 授权。
- 用户基础信息：
  - `id`
  - `name`
  - `student_id`
  - `login_email`
  - `phone_number`
  - `qq_number`
  - `college`
  - `major`
  - `profile.intro`
  - `profile.github_url`
  - `profile.blog_url`
  - `profile.avatar`
- 用户角色：
  - `freshman`
  - `member`
  - `lecturer`
  - `admin`
- 用户状态：
  - `njupter`
  - `on-sast`
  - `retired-sast`
  - `is_deleted`
- 管理员封禁用户。

### People 负责

- 流程管理。
- 用户报名 `user_flow`。
- 笔试/阅卷/评分。
- 面试评价。
- 邮件模板、邮件批次、邮件发送记录。
- 业务表中保存 Link 用户 id，用于关联业务记录。

## 关键规则

- People 不直接读取 Link 数据库。
- People 只通过 Link API 读取用户信息。
- People 只能通过 Link API 修改用户角色和封禁用户。
- People 不能修改用户基础资料。资料页只读，并提供跳转到 Link 修改的入口。
- `personalStatement` 迁移为 `profile.intro`。
- `college`、`major` 由 Link 的用户表管理。
- People 业务表中的用户 id 使用 Link `user.id`，不是旧 People `public.user.id`。

## Link API 契约

People v3 当前依赖以下接口：

| 用途 | 方法 | 路径 |
| --- | --- | --- |
| OAuth 授权 | `GET` | `/oauth/authorize` |
| OAuth 换 token / 刷新 token | `POST` | `/oauth/token` |
| 当前用户资料 | `GET` | `/user/profile` |
| 管理员用户列表 | `GET` | `/admin/users` |
| 管理员用户详情 | `GET` | `/admin/users/{id}` |
| 修改用户角色 | `PUT` | `/admin/users/{id}` |
| 封禁用户 | `DELETE` | `/admin/users/{id}` |

People v3 期望的用户字段：

```ts
{
  id: number;
  name: string;
  student_id?: string | null;
  login_email?: string | null;
  phone_number?: string | null;
  qq_number?: string | null;
  college?: string | null;
  major?: string | null;
  role: "freshman" | "member" | "lecturer" | "admin";
  state: "njupter" | "on-sast" | "retired-sast" | "is_deleted";
  profile?: {
    department?: "software" | "media" | null;
    intro?: string | null;
    email?: string | null;
    avatar?: string | null;
    blog_url?: string | null;
    github_url?: string | null;
  } | null;
  created_at?: string;
  updated_at?: string;
}
```

当前 MCP OpenAPI 中已经能看到这些接口路径，但 schema 还没有完全补齐：

- `/user/profile` 目前缺 `college`、`major`。
- `/admin/users` 列表项目前缺 `phone_number`、`qq_number`、`college`、`major`。
- `profile.intro` 已经在 schema 中。

所以现在 People v3 可以用 mock 本地测试，但还不适合切真实 Link API 上线。

## 环境变量

`.env.example` 中已经包含 v3 需要的 Link 配置：

```env
LINK_CLIENT_ID=
LINK_CLIENT_SECRET=
LINK_API_BASE_URL=
LINK_AUTH_BASE_URL=
LINK_OAUTH_SCOPES=openid profile
LINK_USE_MOCK=false
LINK_ALLOW_LEGACY_FALLBACK=false
PEOPLE_ALLOW_LEGACY_AUTH=false
NEXT_PUBLIC_LINK_PROFILE_URL=
```

本地等待 Link 接口时可以使用 mock：

```env
LINK_USE_MOCK=true
LINK_ALLOW_LEGACY_FALLBACK=true
PEOPLE_ALLOW_LEGACY_AUTH=false
```

真实联调时建议：

```env
LINK_USE_MOCK=false
LINK_ALLOW_LEGACY_FALLBACK=false
PEOPLE_ALLOW_LEGACY_AUTH=false
```

## 数据库迁移

v3 数据库不直接复用线上原库。推荐保留原版数据库，单独创建 People v3 数据库。

已新增迁移：

- `migrations/0011_link_user_ids.sql`

作用：

- 去掉业务表到旧 `public.user` 的外键约束。
- 允许业务表保存 Link 用户 id。

已新增一次性迁移脚本：

- `scripts/people-v3-link-user-id-migration.sql`

迁移前需要先准备映射表：

```sql
create table people_legacy_user_map (
  legacy_user_id integer primary key,
  link_user_id integer not null
);
```

映射来源是 Link 数据库中已迁好的用户表，按学号匹配旧 People 用户和 Link 用户：

```sql
select
  p.id as legacy_user_id,
  u.id as link_user_id
from staging.people_user p
join public."user" u
  on upper(trim(p.student_id)) = upper(trim(u.student_id))
where nullif(trim(p.student_id), '') is not null;
```

导入 `people_legacy_user_map` 后运行：

```sql
\i scripts/people-v3-link-user-id-migration.sql
```

本地已验证映射数量为 384，且 `user_flow.fk_user_id` 等业务字段已从旧 People 用户 id 替换为 Link 用户 id。

## 代码结构

Link 适配层集中在：

- `lib/link/client.ts`
- `lib/link/oauth.ts`
- `lib/link/session.ts`
- `lib/link/user.ts`
- `lib/link/admin.ts`
- `lib/link/user-lookup.ts`
- `lib/link/people-user.ts`
- `lib/link/role.ts`
- `lib/link/types.ts`
- `lib/link/mock.ts`

主要职责：

- 统一请求 Link API。
- 处理 OAuth token。
- 处理 session 中的 Link token。
- 将 Link 用户模型转换成 People 当前使用的 `userType` 视图模型。
- 在本地开发时提供 mock 或 legacy fallback。

## 已迁移的 People 功能

- Link OAuth 登录。
- 当前用户资料读取。
- 用户列表读取。
- 用户详情读取。
- 管理员修改用户角色。
- 管理员封禁用户。
- 个人资料页只读，跳转 Link 修改。
- 报名校验。
- 按学号查报名记录。
- 流程 owner 展示。
- 阅卷成绩列表。
- 面评列表和候选人列表。
- 邮件目标列表、邮件批次和测试邮件。
- 旧飞书/测试登录生产默认关闭。

## 仍然保留的旧 `public.user`

短期不要删除 `public.user`。

原因：

- 本地开发 fallback 仍可能读取旧表。
- Link 真实接口未完成前，旧表有助于排查迁移问题。
- 删除旧表前需要确认所有环境已经关闭：
  - `LINK_USE_MOCK=false`
  - `LINK_ALLOW_LEGACY_FALLBACK=false`
  - `PEOPLE_ALLOW_LEGACY_AUTH=false`

等真实 Link 联调稳定后，可以考虑：

1. 将 `public.user` 改名为 `legacy_user`。
2. 观察一段时间。
3. 最后再删除。

## 联调清单

Link 接口完成后，按以下顺序联调：

1. OAuth 登录
   - 跳转 Link 授权页。
   - 回调 `/api/auth/link`。
   - People session 中保存 Link `access_token` / `refresh_token`。

2. 当前用户资料
   - `/dashboard` 显示姓名、角色和只读资料。
   - `college`、`major`、`profile.intro` 正常显示。

3. 用户管理
   - 用户列表分页、搜索。
   - 用户详情。
   - 改角色。
   - 封禁用户。

4. 报名流程
   - 普通用户报名。
   - 缺少必要资料时正确提示。
   - `user_flow.fk_user_id` 保存 Link 用户 id。

5. 阅卷与面评
   - 按学号查考生。
   - 阅卷列表姓名/学号/手机号显示正确。
   - 面评候选人和审批列表显示正确。

6. 邮件
   - 邮件目标列表。
   - 生成邮件批次。
   - 测试邮件。
   - 发送记录中的用户姓名和学号显示正确。

## 上线建议

当前不建议将 v3 合入线上。

推荐节奏：

1. 线上继续运行原版 People。
2. `sast-people-v3` 分支保留。
3. 等 Link 后端接口字段补齐。
4. 在测试环境关闭 mock 做真实联调。
5. 验收通过后再合并和部署。

## 常见问题

### v3 是否按学号映射？

一次性数据迁移按学号映射旧 People 用户和 Link 用户。运行后的业务表保存 Link `user.id`，后续运行时不再用学号做主关联。

### `legacy_user_id` 是什么？

`legacy_user_id` 是旧 People `public.user.id`。它只用于一次性迁移映射，不参与 v3 运行时逻辑。

### People 还能改用户资料吗？

不能。People 只读用户资料。修改资料去 Link。

### People 能改角色和封禁吗？

可以，但必须通过 Link API：

- 改角色：`PUT /admin/users/{id}`
- 封禁：`DELETE /admin/users/{id}`

### 为什么现在还要保留 mock？

因为 Link 真实接口字段还没完全补齐。mock 用来验证 People 侧调用链、页面渲染和业务流程。
