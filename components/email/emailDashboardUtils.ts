export type EmailRecipient = {
  userFlowId: number;
  userId: number;
  name: string;
  studentId: string | null;
};

export type EmailDeliveryLike = {
  userFlowId: number | null;
  status?: string;
};

export function getRemainingEmailRecipients<TRecipient extends EmailRecipient>({
  recipients,
  deliveries,
}: {
  recipients: TRecipient[];
  deliveries: EmailDeliveryLike[];
}) {
  const deliveryUserFlowIds = new Set(
    deliveries.map((delivery) => delivery.userFlowId),
  );

  return recipients.filter(
    (recipient) => !deliveryUserFlowIds.has(recipient.userFlowId),
  );
}

export function getQueueableEmailRecipients<TRecipient extends EmailRecipient>({
  recipients,
  deliveries,
}: {
  recipients: TRecipient[];
  deliveries: EmailDeliveryLike[];
}) {
  const deliveryStatuses = new Map<number, string[]>();

  for (const delivery of deliveries) {
    if (delivery.userFlowId === null) continue;
    const statuses = deliveryStatuses.get(delivery.userFlowId) ?? [];
    statuses.push(delivery.status ?? "sent");
    deliveryStatuses.set(delivery.userFlowId, statuses);
  }

  return recipients.filter((recipient) => {
    const statuses = deliveryStatuses.get(recipient.userFlowId);
    if (!statuses) return true;
    if (statuses.some((status) => status === "sent" || status === "sending")) {
      return false;
    }
    return statuses.some(
      (status) => status === "pending" || status === "failed" || status === "dead",
    );
  });
}

export function getEmailPreflight<TRecipient extends EmailRecipient>({
  recipients,
  deliveries,
}: {
  recipients: TRecipient[];
  deliveries: EmailDeliveryLike[];
}) {
  const remainingRecipients = getQueueableEmailRecipients({
    recipients,
    deliveries,
  });
  const invalidRecipients = remainingRecipients.filter(
    (recipient) => !recipient.studentId?.trim(),
  );

  return {
    remainingRecipients,
    invalidRecipients,
    alreadyCreatedCount: recipients.length - remainingRecipients.length,
    canSend: remainingRecipients.length > 0 && invalidRecipients.length === 0,
  };
}

export function getEducationEmailLabel(studentId: string | null | undefined) {
  const normalized = studentId?.trim();
  return normalized ? `${normalized}@njupt.edu.cn` : "-";
}
