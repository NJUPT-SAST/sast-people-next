import "server-only";

import { sendEmailDelivery } from "@/lib/email-center/delivery";
import { mqClient } from "./client";

export const sendEmail = mqClient.createFunction(
  {
    id: "step/send.email",
    triggers: [{ event: "step/send.email" }],
  },
  async ({ event }) => {
    const { deliveryId } = event.data;
    await sendEmailDelivery(Number(deliveryId), { trigger: "queue" });
    return { success: true, deliveryId };
  },
);
