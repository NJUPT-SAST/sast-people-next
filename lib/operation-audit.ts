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

export async function writeOperationAudit({
  actorId,
  actorRole = null,
  actorType = "user",
  action,
  resourceType,
  resourceId = null,
  department = null,
  metadata,
}: OperationAuditInput) {
  try {
    await db.insert(operationAudit).values({
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
  }
}
