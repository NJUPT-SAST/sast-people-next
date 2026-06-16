import "server-only";

import { createHash } from "crypto";

function normalizeResultKind(accept: boolean) {
  return accept ? "accepted" : "rejected";
}

export function getResultEmailDeliveryIdempotencyKey({
  flowId,
  accept,
  userFlowId,
}: {
  flowId: number;
  accept: boolean;
  userFlowId: number;
}) {
  return `result:${flowId}:${normalizeResultKind(accept)}:${userFlowId}`;
}

export function getResultEmailBatchIdempotencyKey({
  flowId,
  accept,
  userFlowIds,
}: {
  flowId: number;
  accept: boolean;
  userFlowIds: number[];
}) {
  const stableUserFlowIds = [...userFlowIds].sort((a, b) => a - b).join(",");
  const digest = createHash("sha256")
    .update(stableUserFlowIds)
    .digest("hex")
    .slice(0, 32);

  return `result-batch:${flowId}:${normalizeResultKind(accept)}:${digest}`;
}
