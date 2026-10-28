import "server-only";

import {
  dispatchDueCustomEmails,
  refreshSendingCustomMessages,
} from "@/lib/email-center/custom-message";
import { logServerError } from "@/lib/server-error-log";
import { mqClient } from "./client";

/**
 * 自定义邮件的定时发送与状态回写。
 *
 * 每分钟扫描一次到点的定时邮件；同时把「发送中」但投递已经结束的邮件
 * 回写成已发送 / 有失败。发送本身仍逐封走 `step/send.email`，
 * 因此频率限制、重试与正文快照口径与结果通知完全一致。
 */
export const customEmailSchedulerJob = mqClient.createFunction(
  {
    id: "email/custom.scheduler",
    triggers: [{ cron: "* * * * *" }],
  },
  async ({ step }) => {
    const dispatch = await step.run("dispatch-due-custom-emails", async () => {
      try {
        return await dispatchDueCustomEmails();
      } catch (error) {
        logServerError("queue:customEmailDispatch", error, {
          action: "dispatch-due-custom-emails",
        });
        throw error;
      }
    });

    const refresh = await step.run("refresh-custom-email-status", async () => {
      try {
        return await refreshSendingCustomMessages();
      } catch (error) {
        logServerError("queue:customEmailRefresh", error, {
          action: "refresh-custom-email-status",
        });
        throw error;
      }
    });

    return { dispatch, refresh };
  },
);