import { getQueueableEmailRecipients } from "@/components/email/emailDashboardUtils";

import type { FlowTarget, ResultEmailDeliveryState } from "./emailDashboardTypes";

type LaneDelivery = {
  userFlowId: number | null;
  status: "pending" | "sending" | "sent" | "failed" | "dead";
};

export function getLaneDeliveries({
  deliveries,
  flowId,
  accept,
}: {
  deliveries: ResultEmailDeliveryState[];
  flowId: number;
  accept: boolean;
}) {
  const safeDeliveries = Array.isArray(deliveries) ? deliveries : [];
  return safeDeliveries
    .filter((delivery) => delivery.flowId === flowId && delivery.accept === accept)
    .map((delivery) => ({
      ...delivery,
      status: delivery.hasSent
        ? "sent"
        : delivery.hasSending
          ? "sending"
          : delivery.hasQueueable
            ? "failed"
            : "sent",
    })) satisfies LaneDelivery[];
}

export function countRemainingRecipients({
  recipients,
  deliveries,
}: {
  recipients: Array<FlowTarget["passed"][number]>;
  deliveries: LaneDelivery[];
}) {
  return getQueueableEmailRecipients({
    recipients: Array.isArray(recipients) ? recipients : [],
    deliveries: Array.isArray(deliveries) ? deliveries : [],
  }).length;
}
