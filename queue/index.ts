import { sendEmail } from "./sendEmail";
import { interviewScheduleReminder } from "./interviewScheduleReminder";
import {
  cleanupEmailDeliveryAttemptsJob,
  retryDueEmailDeliveriesJob,
} from "./emailMaintenance";
import { cleanupExpiredSessionsJob } from "./sessionMaintenance";

const queueFunctions = [
  sendEmail,
  interviewScheduleReminder,
  retryDueEmailDeliveriesJob,
  cleanupEmailDeliveryAttemptsJob,
  cleanupExpiredSessionsJob,
];

export default queueFunctions;
