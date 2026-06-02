import "server-only";

import { db } from "@/db/drizzle";
import { operationAudit } from "@/db/schema";
import { logServerError } from "@/lib/server-error-log";

export type OperationAuditInput = {
  actorId: number;
  action: string;
  resourceType: string;
  resourceId?: number | null;
  metadata?: Record<string, unknown>;
};

export async function writeOperationAudit({
  actorId,
  action,
  resourceType,
  resourceId = null,
  metadata,
}: OperationAuditInput) {
  try {
    await db.insert(operationAudit).values({
      actorId,
      action,
      resourceType,
      resourceId,
      metadata,
    });
  } catch (error) {
    logServerError("operation-audit:write", error, {
      userId: actorId,
      action: "write-operation-audit",
      metadata: {
        auditAction: action,
        resourceType,
        resourceId,
      },
    });
  }
}
