import { sendEmail } from "./sendEmail";
import { interviewScheduleReminder } from "./interviewScheduleReminder";
import { interviewScheduleCancellation } from "./interviewScheduleCancellation";
import {
  interviewScheduleCancellationOutboxDispatcher,
} from "./interviewScheduleCancellationOutbox";
import {
  cleanupEmailDeliveryAttemptsJob,
  retryDueEmailDeliveriesJob,
} from "./emailMaintenance";
import { cleanupExpiredSessionsJob } from "./sessionMaintenance";
import { customEmailSchedulerJob } from "./customEmail";

const queueFunctions = [
  sendEmail,
  customEmailSchedulerJob,
  interviewScheduleCancellation,
  interviewScheduleCancellationOutboxDispatcher,
  interviewScheduleReminder,
  retryDueEmailDeliveriesJob,
  cleanupEmailDeliveryAttemptsJob,
  cleanupExpiredSessionsJob,
];

export default queueFunctions;
