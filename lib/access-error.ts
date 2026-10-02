/**
 * 访问控制错误类型：让 API 路由把「未登录 / 权限不足 / 内部错误」映射成不同状态码，
 * 而不是把 verifySession 的登录跳转与角色不足都吞成 500（或一律 403）。
 *
 * - UnauthenticatedError：没有会话（页面走 redirect，API 回 401）
 * - ForbiddenError：角色或部门权限不足（API 回 403）
 *   DepartmentAccessError（lib/authz.ts）是它的部门子类，便于调用方区分文案。
 */

export class UnauthenticatedError extends Error {
  constructor(message = "未登录或会话已失效") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "没有权限执行该操作") {
    super(message);
    this.name = "ForbiddenError";
  }
}
