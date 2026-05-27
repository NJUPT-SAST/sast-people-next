import { mqClient } from "@/queue/client";
import { sendEmail } from "@/queue/sendEmail";
import "server-only";

export default async function offer(deliveryId: number) {
  await mqClient.send({
    name: sendEmail.name,
    data: {
      deliveryId,
    },
  });
}
