import "server-only";

import {
  assertEmailConfigured,
  sendEmailDelivery,
  sendRawEmail,
} from "@/lib/email-center/delivery";
import { mqClient } from "./client";

export { assertEmailConfigured, sendRawEmail };
export const sendDelivery = sendEmailDelivery;

export const sendEmail = mqClient.createFunction(
  {
    id: "step/send.email",
    triggers: [{ event: "step/send.email" }],
  },
  async ({ event }) => {
    const { deliveryId } = event.data;
    await sendEmailDelivery(Number(deliveryId));
    return { success: true, deliveryId };
  },
);
