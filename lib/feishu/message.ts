import "server-only";

import { getFeishuClient } from "@/lib/feishu/client";

export type SendFeishuTextMessageInput = {
  openId: string;
  text: string;
  uuid?: string;
};

export async function sendFeishuTextMessage({
  openId,
  text,
  uuid,
}: SendFeishuTextMessageInput) {
  const res = await getFeishuClient().im.v1.message.create({
    params: {
      receive_id_type: "open_id",
    },
    data: {
      receive_id: openId,
      msg_type: "text",
      content: JSON.stringify({ text }),
      uuid,
    },
  });

  if (res.code && res.code !== 0) {
    throw new Error(`send feishu message failed: ${res.msg ?? res.code}`);
  }

  return {
    messageId: res.data?.message_id,
  };
}
