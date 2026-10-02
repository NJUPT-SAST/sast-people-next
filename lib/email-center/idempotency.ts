import "server-only";

import { createHash } from "crypto";

function normalizeResultKind(accept: boolean) {
  return accept ? "accepted" : "rejected";
}

/** 可选的去重作用域（例如办公类一面通知 office_round1），避免与最终结果批次互相覆盖 */
function normalizeScope(scope?: string | null) {
  const trimmed = scope?.trim();
  return trimmed ? `${trimmed}:` : "";
}

export function getResultEmailDeliveryIdempotencyKey({
  flowId,
  accept,
  userFlowId,
  scope,
}: {
  flowId: number;
  accept: boolean;
  userFlowId: number;
  scope?: string | null;
}) {
  return `result:${flowId}:${normalizeScope(scope)}${normalizeResultKind(accept)}:${userFlowId}`;
}

export function getResultEmailBatchIdempotencyKey({
  flowId,
  accept,
  userFlowIds,
  scope,
}: {
  flowId: number;
  accept: boolean;
  userFlowIds: number[];
  scope?: string | null;
}) {
  const stableUserFlowIds = [...userFlowIds].sort((a, b) => a - b).join(",");
  const digest = createHash("sha256")
    .update(stableUserFlowIds)
    .digest("hex")
    .slice(0, 32);

  return `result-batch:${flowId}:${normalizeScope(scope)}${normalizeResultKind(accept)}:${digest}`;
}
