import "server-only";

import { db } from "@/db/drizzle";
import { normalizeDepartmentKey, operationAudit } from "@/db/schema";
import { logServerError } from "@/lib/server-error-log";

export type OperationAuditInput = {
  actorId: number;
  actorRole?: number | null;
  actorType?: "user" | "provider" | "system";
  action: string;
  resourceType: string;
  resourceId?: number | null;
  /* 目标资源所属部门（Link 部门标识）；null 表示全局操作，仅管理员可见 */
  department?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeOperationAudit(
  {
    actorId,
    actorRole = null,
    actorType = "user",
    action,
    resourceType,
    resourceId = null,
    department = null,
    metadata,
  }: OperationAuditInput,
  /**
   * 事务内调用时传 executor：留档与业务写入要么一起成功、要么一起回滚。
   * 事务内的写入失败必须抛出（否则业务已提交却缺留档，后续无法补齐）。
   */
  options: { executor?: { insert: typeof db.insert } } = {},
) {
  const executor = options.executor ?? db;
  try {
    await executor.insert(operationAudit).values({
      actorId,
      actorRole,
      actorType,
      action,
      resourceType,
      resourceId,
      department: normalizeDepartmentKey(department),
      metadata,
    });
  } catch (error) {
    logServerError("operation-audit:write", error, {
      userId: actorId,
      action: "write-operation-audit",
      metadata: {
        auditAction: action,
        actorType,
        resourceType,
        resourceId,
        department: normalizeDepartmentKey(department),
      },
    });
    if (options.executor) throw error;
  }
}
