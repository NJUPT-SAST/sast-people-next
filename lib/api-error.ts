import "server-only";

import { ForbiddenError } from "@/lib/access-error";
import { isNextControlFlowError } from "@/lib/server-error-log";
import { NextResponse } from "next/server";

/**
 * API 路由的统一错误响应：
 * - 未登录（verifySession 抛出的 NEXT_REDIRECT / 会话缺失）→ 401；
 * - 角色或部门权限不足（ForbiddenError / DepartmentAccessError）→ 403，回显权限文案；
 * - 其他内部错误 → 500，只给统一文案，不回显内部 message。
 *
 * 调用方负责 logServerError（保留 path/action 等上下文），这里只做映射。
 */
export function apiErrorResponse(
  error: unknown,
  fallbackMessage = "请求失败，请稍后重试",
) {
  if (isNextControlFlowError(error)) {
    return NextResponse.json(
      { success: false, message: "未登录或会话已失效" },
      { status: 401 },
    );
  }

  if (error instanceof ForbiddenError) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 403 },
    );
  }

  return NextResponse.json(
    { success: false, message: fallbackMessage },
    { status: 500 },
  );
}
