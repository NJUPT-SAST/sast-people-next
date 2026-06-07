import { getQueueableEmailRecipients } from "@/components/email/emailDashboardUtils";

import type { EmailBatch, FlowTarget } from "./emailDashboardTypes";

export function getLaneDeliveries({
  batches,
  flowId,
  accept,
}: {
  batches: EmailBatch[];
  flowId: number;
  accept: boolean;
}) {
  const safeBatches = Array.isArray(batches) ? batches : [];
  return safeBatches
    .filter((batch) => batch.flowId === flowId && batch.accept === accept)
    .flatMap((batch) => (Array.isArray(batch.deliveries) ? batch.deliveries : []));
}

export function countRemainingRecipients({
  recipients,
  deliveries,
}: {
  recipients: Array<FlowTarget["passed"][number]>;
  deliveries: EmailBatch["deliveries"];
}) {
  return getQueueableEmailRecipients({
    recipients: Array.isArray(recipients) ? recipients : [],
    deliveries: Array.isArray(deliveries) ? deliveries : [],
  }).length;
}
