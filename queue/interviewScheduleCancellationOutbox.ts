import "server-only";

import {
  dispatchInterviewScheduleCancellationOutbox,
} from "@/lib/interview-schedule-cancellation-outbox";
import { mqClient } from "./client";

export const interviewScheduleCancellationOutboxDispatcher =
  mqClient.createFunction(
    {
      id: "interview/schedule.cancellation-outbox.dispatch",
      triggers: [{ cron: "* * * * *" }],
    },
    async ({ step }) =>
      step.run("dispatch-interview-schedule-cancellations", () =>
        dispatchInterviewScheduleCancellationOutbox(),
      ),
  );
