import { sendEmail } from "./sendEmail";
import { approvalReminder } from "./approvalReminder";
import { interviewScheduleReminder } from "./interviewScheduleReminder";
import {
  cleanupEmailDeliveryAttemptsJob,
  retryDueEmailDeliveriesJob,
} from "./emailMaintenance";
import { cleanupExpiredSessionsJob } from "./sessionMaintenance";

const queueFunctions = [
  sendEmail,
  approvalReminder,
  interviewScheduleReminder,
  retryDueEmailDeliveriesJob,
  cleanupEmailDeliveryAttemptsJob,
  cleanupExpiredSessionsJob,
];

export default queueFunctions;
